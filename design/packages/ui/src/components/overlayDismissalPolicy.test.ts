// @vitest-environment node

/**
 * "Right click menu not closing when clicking off the menu" -- kept fixed by a test rather
 * than by remembering, and generalised to every overlay this package can open, not only the
 * one the report named.
 *
 * ## The mechanism, traced rather than guessed
 *
 * Every popover-shaped surface in this package is Vuetify's `<v-menu>` (built on
 * `VOverlay`), which already supplies Escape handling, window-listener teardown and
 * outside-click detection via its own `v-click-outside` directive -- one shared primitive,
 * not a document listener reinvented per file. That directive treats a click as "outside"
 * unless it lands inside the overlay's own content OR inside whatever `VOverlay`'s
 * `useActivator` composable resolved as `activatorEl`:
 *
 * ```
 * // VOverlay.js
 * include: () => [activatorEl.value]
 * ```
 *
 * `activatorEl` comes from the `:activator` prop, and only from that prop -- reading
 * `useActivator.js` shows `target` (positioning) and `activatorEl` (click-outside inclusion,
 * hover, focus, and the `aria-haspopup`/`aria-controls`/`aria-expanded` wiring) are resolved
 * independently:
 *
 * ```
 * const target = computed(() => {
 *     if (props.target === 'cursor' && cursorTarget.value) return cursorTarget.value;
 *     if (targetRef.value) return targetRef.el;
 *     return getTarget(props.target, vm) || activatorEl.value;
 * });
 * ```
 *
 * So a `<v-menu>` that sets an explicit `:target` for positioning (a pointer coordinate, a
 * specific anchor element) *and* a separate dynamic `:activator` for its ARIA wiring gets
 * positioned by `:target` but still treats the *entire* `:activator` element as permanently
 * "inside" for outside-click purposes -- regardless of where `:target` actually put the
 * overlay on screen. `AppearanceTarget.vue` did exactly this: `:activator="root"` where
 * `root` is the whole wrapped surface (for `id="app.tabBar"`, the entire tab bar and every
 * page under it), so almost any click anywhere in the application landed "inside" `root` and
 * the outside-click directive waved it through. That is the reported bug, traced to the
 * exact line.
 *
 * The fix used throughout this file's own history is not "delete `:activator`, lose the
 * ARIA wiring" -- `aria-haspopup`/`aria-controls`/`aria-expanded` are real accessibility
 * information a screen-reader user needs, and `useActivator` only writes them when
 * `:activator` is set. The correct shape, and the one this test enforces, is: a `<v-menu>`
 * that needs `:target` for positioning wires its own `aria-haspopup`/`aria-expanded`/
 * `aria-controls` by hand and never *also* binds a dynamic `:activator` -- see
 * `AppearanceTarget.vue`'s `menuId`/`editorId` for the worked example. `activator="parent"`
 * on a small dedicated trigger (a bell icon, a `+` button) stays exactly as safe as it always
 * was: `:target` is never set alongside it, so there is nothing to collide with.
 *
 * ## The two-part guard
 *
 *  1. **The mechanism sweep.** Every `<v-menu>` tag under `packages/ui/src` is parsed for a
 *     dynamic (non-`"parent"`) `:activator` binding *and* an explicit `:target` binding at
 *     the same time. Finding both on one tag is the defect, full stop -- this is checked
 *     structurally, so a brand new overlay written the same wrong way next month fails this
 *     file exactly as `AppearanceTarget.vue` would have, without anyone updating a list.
 *     Alongside it: no swept `<v-menu>` may set `persistent`, which would silently disable
 *     both Escape and outside-click dismissal at once -- the other easy way to reintroduce
 *     this exact bug class.
 *  2. **The declared inventory.** Every file that either owns a `<v-menu>` or wraps content
 *     in the shared `<AppearanceTarget>` wrapper (which brings its own two `<v-menu>`s along
 *     for free) is named below with its current dismissal status, cross-checked against the
 *     live sweep rather than trusted. `"pending"` names a surface this task's own scouting
 *     found broken, with the owner fixing it; a `"pending"` entry whose file the live sweep
 *     now finds clean fails this test too, which is what forces the entry to be promoted to
 *     `"clean"` the moment the real fix lands, rather than the registry quietly going stale.
 *
 * A file wrapped in `<AppearanceTarget>` gets exactly one thing to say about the mechanism:
 * whichever way `AppearanceTarget.vue` itself is wired, every one of its callers is wired the
 * same way, because it is the one shared component doing the work for all of them. That is
 * also why fixing `AppearanceTarget.vue` alone clears every row below that only wraps it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** `packages/ui/src`, one level above this file (`components/overlayDismissalPolicy.test.ts`). */
const UI_SRC = fileURLToPath(new URL("..", import.meta.url));

function read(file: string): string {
    return readFileSync(join(UI_SRC, file), "utf8");
}

function relativeToSource(path: string): string {
    return relative(UI_SRC, path).split("\\").join("/");
}

function vueFiles(dir: string, found: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            vueFiles(path, found);
            continue;
        }
        if (name.endsWith(".vue")) found.push(path);
    }
    return found;
}

const VUE_FILES = vueFiles(UI_SRC).map(relativeToSource);

/* -------------------------------------------------------------------------- */
/* The detector: every <v-menu ...> opening tag, and what it binds            */
/* -------------------------------------------------------------------------- */

/**
 * The index of the `>` that actually closes the tag opened at `start`, skipping any `>`
 * that appears inside a quoted attribute value (`:style="{ opacity: level > 2 ? 1 : 0.5 }"`
 * is an ordinary Vue binding in this codebase, and a naive `indexOf(">")` stops there
 * instead of at the tag's real end -- truncating away every attribute that follows,
 * including `:activator` and `:target`). Returns -1 if the tag never closes.
 */
function findTagEnd(source: string, start: number): number {
    let quote: '"' | "'" | null = null;
    for (let i = start; i < source.length; i++) {
        const char = source[i];
        if (quote !== null) {
            if (char === quote) quote = null;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            continue;
        }
        if (char === ">") return i;
    }
    return -1;
}

/**
 * Every `<v-menu ...>` opening tag in `source`, attributes and all, up to the closing `>`,
 * matched however the tag was actually written. `AppearanceTarget.vue` imports the component
 * as `VMenu` from `"vuetify/components"`, and Vue 3's SFC compiler resolves a locally-imported
 * component by either its PascalCase name (`<VMenu>`) or the equivalent kebab-case tag
 * (`<v-menu>`) -- the two spellings mount the identical component. A scanner that only matched
 * the hyphenated literal would let a PascalCase `<VMenu>` -- with the exact reported-bug shape --
 * through this whole guard file unseen. Match on the tag's *name*, normalised (lower-cased,
 * hyphens stripped) to `"vmenu"`, rather than on one literal spelling.
 */
function vMenuTags(source: string): string[] {
    const tags: string[] = [];
    const OPEN_TAG = /<([A-Za-z][\w-]*)/g;
    let match: RegExpExecArray | null;
    while ((match = OPEN_TAG.exec(source)) !== null) {
        const tagName = (match[1] ?? "").toLowerCase().replace(/-/g, "");
        if (tagName !== "vmenu") continue;
        const close = findTagEnd(source, match.index);
        if (close === -1) continue;
        tags.push(source.slice(match.index, close + 1));
    }
    return tags;
}

/**
 * The raw text of an object-literal `v-bind="{ ... }"` on `tag`, or `null` when there is no
 * `v-bind` or its value is not an object literal (a bound identifier like `v-bind="menuProps"`
 * can't be inspected statically, so it is left alone rather than guessed at).
 *
 * Vue -- and therefore every Vuetify component prop, `activator`/`target` included -- treats
 * `v-bind="{ activator: root, target: pos }"` identically to spelling each key as its own
 * `:activator="root" :target="pos"` binding. `hasDynamicActivator`/`hasExplicitTarget` used to
 * look only for the literal `:activator="..."` / `:target="..."` attribute syntax, so a
 * `<v-menu>` written with this object-spread idiom -- already used on other components
 * elsewhere in this very package (`ProfileManager.vue`, `ProjectList.vue`, `App.vue`) --
 * reproduced the exact "menu does not close on outside click" bug while sailing straight
 * through this guard. Both detectors below look inside this object literal for the same two
 * keys the direct-attribute form checks for.
 */
function vBindObjectLiteral(tag: string): string | null {
    const match = /\bv-bind="([^"]*)"/.exec(tag);
    if (match === null) return null;
    const value = (match[1] ?? "").trim();
    return value.startsWith("{") ? value : null;
}

/**
 * The raw expression bound to `key` inside an object-literal `v-bind` value, or `null` when
 * `key` is not one of its properties. Anchored on a preceding `{` or `,` so `deactivator: x`
 * can never be mistaken for an `activator` key, and `retarget: x` never for a `target` key.
 */
function vBindKeyExpression(objectLiteral: string, key: string): string | null {
    const match = new RegExp(`[{,]\\s*${key}\\s*:\\s*([^,}]*)`).exec(objectLiteral);
    return match === null ? null : (match[1] ?? "").trim();
}

/**
 * A bound `:activator="..."` whose value is not the literal string `"parent"` -- or the same
 * thing spelled as an `activator` key inside an object-literal `v-bind`. Vue's template
 * compiler accepts a direct attribute binding wrapped in either quote character identically,
 * so both must be recognised here -- a detector that only matched double quotes would let the
 * exact reported-bug shape back in the moment someone (or a formatter) wrote
 * `:activator='root'` instead of `:activator="root"`.
 */
function hasDynamicActivator(tag: string): boolean {
    const direct = /:activator=(["'])([\s\S]*?)\1/.exec(tag);
    const expression =
        direct !== null
            ? (direct[2]?.trim() ?? "")
            : vBindKeyExpression(vBindObjectLiteral(tag) ?? "{}", "activator");
    if (expression === null) return false;
    return expression !== "'parent'" && expression !== '"parent"';
}

function hasExplicitTarget(tag: string): boolean {
    if (/:target=["']/.test(tag)) return true;
    const objectLiteral = vBindObjectLiteral(tag);
    return objectLiteral !== null && vBindKeyExpression(objectLiteral, "target") !== null;
}

function isPersistent(tag: string): boolean {
    return /\bpersistent\b/.test(tag);
}

/** Every file with at least one `<v-menu` tag. */
const SWEPT_V_MENU = new Set(VUE_FILES.filter((file) => vMenuTags(read(file)).length > 0));

/**
 * Whether `source` wraps content in the shared `<AppearanceTarget>` component. Vue's SFC
 * compiler resolves a locally-imported component by either its PascalCase name or the
 * equivalent kebab-case tag -- `<AppearanceTarget ...>` and `<appearance-target ...>` mount
 * the exact same component, identically. A detector that only matched the PascalCase spelling
 * would let a new page written with the kebab-case tag ship an unregistered, unaccounted-for
 * AppearanceTarget consumer that this file's completeness guard (below) never sees, so both
 * spellings must be recognised here.
 *
 * The tag name must be followed by whitespace, `/` (self-close) or `>` -- a plain `\b` word
 * boundary is not enough, because the boundary between a word character and a hyphen is
 * itself a `\b`, which would wrongly flag an unrelated element such as
 * `<appearance-target-something-else>` as an AppearanceTarget wrapper.
 */
function usesAppearanceTarget(source: string): boolean {
    return /<(?:AppearanceTarget|appearance-target)(?=[\s/>])/.test(source);
}

/** Every file wrapping content in `<AppearanceTarget>`, other than the primitive itself. */
const APPEARANCE_TARGET_USERS = new Set(
    VUE_FILES.filter(
        (file) =>
            file !== "components/appearance/AppearanceTarget.vue" &&
            usesAppearanceTarget(read(file)),
    ),
);

/** True when one of `file`'s own `<v-menu>` tags binds a colliding activator and target. */
function fileCollides(file: string): boolean {
    return vMenuTags(read(file)).some((tag) => hasDynamicActivator(tag) && hasExplicitTarget(tag));
}

function filePersistent(file: string): boolean {
    return vMenuTags(read(file)).some((tag) => isPersistent(tag));
}

const APPEARANCE_TARGET_FILE = "components/appearance/AppearanceTarget.vue";

/* -------------------------------------------------------------------------- */
/* The declared inventory                                                     */
/* -------------------------------------------------------------------------- */

type Status = "clean" | "pending" | "not-applicable";

interface OverlayEntry {
    readonly file: string;
    readonly surface: string;
    /** This file's own `<v-menu>` tag(s), if any, are part of the mechanism check. */
    readonly ownVMenu: boolean;
    /** This file wraps content in `<AppearanceTarget>`, inheriting its wiring wholesale. */
    readonly wrapsAppearanceTarget: boolean;
    readonly status: Status;
    /** Required, and asserted non-empty, when `status` is `"pending"`. */
    readonly owner?: string;
    /** Required, and asserted non-empty, when `status` is `"not-applicable"`. */
    readonly reason?: string;
}

const REGISTRY: readonly OverlayEntry[] = [
    {
        file: APPEARANCE_TARGET_FILE,
        surface:
            "The shared per-element 'Edit appearance...' context menu and its editor popover -- " +
            "the wrapper every AppearanceTarget consumer below reuses.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "App.vue",
        surface:
            'Two AppearanceTarget wrappers: id="app.titleBar" (the whole title bar) and ' +
            'id="app.tabBar" (the whole tab bar and every page under it) -- the highest-blast-' +
            "radius instance of the defect, and very likely the exact reproduction reported.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/ProfileManager.vue",
        surface: "Context menu of a map/server profile row (Edit/Reset appearance).",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/project/ProjectList.vue",
        surface: "Context menu of a project/world row (Edit/Reset appearance).",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/project/DiscoveredWorldsPanel.vue",
        surface:
            "Context menu of a discovered-but-not-yet-a-project world row (Edit/Reset appearance).",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/renders/RendersScreen.vue",
        surface: "Context menu of a render-in-progress row (Edit/Reset appearance).",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/settings/DependencyInstallerPanel.vue",
        surface:
            "Context menu of a system-dependency row (git/GitHub CLI/Docker Desktop/rsync) in the winget/Chocolatey installer.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/controlbar/ControlBar.vue",
        surface: "Context menu of the whole map control bar.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/eula/EulaSectionPanel.vue",
        surface: "Context menu of one EULA section.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/settings/DockedSurface.vue",
        surface:
            'Its own placement-chooser <v-menu> (activator="parent" on a small icon button -- ' +
            "always clean) PLUS an AppearanceTarget wrapper around the panel title, which " +
            "inherits AppearanceTarget.vue's wiring.",
        ownVMenu: true,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/appearance/ColorField.vue",
        surface: "The colour-picker popover hosting InfiniteColorPicker.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/appearance/TypographyEditor.vue",
        surface: "The font-family picker popover.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/changelog/ChangelogDateFilter.vue",
        surface: "The advanced calendar popover behind the changelog's date-range filter.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/changelog/ChangelogViewer.vue",
        surface: "The 'Copy' and 'Export' format pickers on the changelog viewer's toolbar.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/config/ConfigSearchField.vue",
        surface: "The regex builder popover anchored to every settings search field.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/config/ConfigSuperConfirm.vue",
        surface: "The destructive-action two-key confirmation gate popover.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/eula/EulaViewer.vue",
        surface:
            "The EULA viewer's 'Export' picker (section/whole document x formats), PLUS an " +
            "AppearanceTarget wrapper around its own tab strip, which inherits " +
            "AppearanceTarget.vue's wiring.",
        ownVMenu: true,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/glossary/GlossaryTerm.vue",
        surface: "The in-place glossary term popover (one definition and a 'Read more' link).",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/history/HistoryComparison.vue",
        surface: "The two-revision comparison's 'Export' format picker.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/history/HistoryPanel.vue",
        surface:
            "The whole history panel's own toolbar 'Export' format picker, PLUS an " +
            'AppearanceTarget wrapper (id="history.panel") around the whole panel, which ' +
            "inherits AppearanceTarget.vue's wiring.",
        ownVMenu: true,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/history/SimpleHistoryList.vue",
        surface:
            "The compact history list's own 'Export' format picker, opened from its toolbar " +
            'button. `activator="parent"` on that one small button, with no `:target` ' +
            "alongside it, so there is nothing for the outside-click include list to collide " +
            "with.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/history/SimpleHistoryPanel.vue",
        surface:
            "The filterable history panel's own 'Export' format picker. Same safe shape as " +
            'SimpleHistoryList.vue above: `activator="parent"` scoped to the toolbar button, ' +
            "never a dynamic `:activator` paired with a `:target`.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/home/HomeScreen.vue",
        surface:
            'Four AppearanceTarget wrappers on the landing tab: id="home.page" (the whole ' +
            'page), id="home.intro" (the newcomer explanation), id="home.continue" (the ' +
            'returning-user row) and id="home.capabilities" (the grouped capability grid) -- ' +
            "no v-menu of its own, so all four inherit AppearanceTarget.vue's wiring wholesale.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/markers/MarkerSearchField.vue",
        surface: "The regex builder popover anchored to the in-viewer marker search field.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/menu/MenuSearchField.vue",
        surface:
            "The regex builder popover anchored to BlueMap's own in-viewer menu search field. " +
            '`:activator="anchor"` alone, no `:target` -- Vuetify\'s own `target` computed falls ' +
            "back to `activatorEl` when `:target` is unset, so the popover's position and its " +
            "click-outside inclusion agree: clicking anywhere inside this one small field while " +
            "its builder is open is deliberately treated as 'inside', not the broad-wrapper defect.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/notifications/NotificationCentre.vue",
        surface: "The notification centre popover (bell icon), hosting NoticeCentrePanel.",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
    {
        file: "components/worldrepo/WorldRepoScreen.vue",
        surface:
            'Four AppearanceTarget wrappers: id="worldrepo.page" (the whole screen), one per ' +
            'sync-in-progress row (id="worldrepo.row.<key>"), one per tracked-world row ' +
            '(id="worldrepo.record.<key>") and id="worldrepo.adoption" (the adoption ' +
            "section) - no v-menu of its own, so all four inherit AppearanceTarget.vue's " +
            "wiring wholesale.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/world/SshWorldSourcePanel.vue",
        surface:
            "The SSH world-source panel's AppearanceTarget context menu and anchored editor; " +
            "the remote file browser itself opens in a bounded v-dialog, not a v-menu.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/world/DockerWorldSourcePanel.vue",
        surface:
            "The local Docker world-source panel's AppearanceTarget context menu and anchored " +
            "editor; its container, mount and volume pickers are bounded Vuetify selects.",
        ownVMenu: false,
        wrapsAppearanceTarget: true,
        status: "clean",
    },
    {
        file: "components/tabs/TabStrip.vue",
        surface:
            "The tab menu and group menu (:target only, no :activator), the new-tab picker, " +
            'the overflow list and the tab finder popover (activator="parent" on their own ' +
            "small trigger buttons, no :target).",
        ownVMenu: true,
        wrapsAppearanceTarget: false,
        status: "clean",
    },
] as const;

const registryByFile = new Map(REGISTRY.map((entry) => [entry.file, entry]));

/** Whether the live sweep currently finds `entry`'s mechanism broken. */
function isBroken(entry: OverlayEntry): boolean {
    if (entry.ownVMenu && fileCollides(entry.file)) return true;
    if (entry.wrapsAppearanceTarget && fileCollides(APPEARANCE_TARGET_FILE)) return true;
    return false;
}

/* -------------------------------------------------------------------------- */
/* The mechanism sweep                                                        */
/* -------------------------------------------------------------------------- */

describe("overlayDismissalPolicy.ts: the mechanism sweep", () => {
    /**
     * The single swept tag from a fragment that must contain exactly one.
     *
     * Indexing returns `string | undefined` under this package's strict index checking, and
     * quietly tolerating the `undefined` would be the worst possible shortcut here: these are
     * the tests that prove the detector SEES a collision, so an assertion handed `undefined`
     * would report a detector that found nothing at all as working perfectly. Throwing names
     * the real problem -- the sweep returned the wrong number of tags -- instead.
     */
    function onlyTag(tags: readonly string[]): string {
        const tag = tags[0];
        if (tag === undefined) {
            throw new Error(`expected exactly one swept <v-menu> tag, got ${tags.length}`);
        }
        return tag;
    }

    it("finds the surfaces it is supposed to be watching", () => {
        expect(VUE_FILES.length).toBeGreaterThan(40);
        expect(SWEPT_V_MENU.size).toBeGreaterThan(10);
    });

    it("never binds a dynamic :activator together with an explicit :target on one <v-menu>", () => {
        const colliding = [...SWEPT_V_MENU].filter((file) => fileCollides(file));
        expect(
            colliding,
            "Right click menu not closing when clicking off the menu (the reported bug): " +
                "Vuetify's outside-click directive always includes the whole :activator element, " +
                "regardless of what :target positions the overlay against. Wire aria-haspopup/" +
                "aria-expanded/aria-controls by hand instead (see AppearanceTarget.vue's menuId/" +
                "editorId) and drop the dynamic :activator, or register this file in REGISTRY as " +
                "'pending' with an owner if another lane is already fixing it.",
        ).toEqual([]);
    });

    it("never sets persistent on a <v-menu>, which would silently disable Escape and outside-click both", () => {
        const persistent = [...SWEPT_V_MENU].filter((file) => filePersistent(file));
        expect(persistent).toEqual([]);
    });

    it("catches a fabricated collision, and does not accuse an ordinary menu", () => {
        // The detector is the whole mechanism check, so it is exercised rather than trusted.
        const broken = '<v-menu v-model="open" :activator="root ?? undefined" :target="pos">';
        expect(hasDynamicActivator(broken) && hasExplicitTarget(broken)).toBe(true);

        const targetOnly = '<v-menu v-model="open" :target="pos">';
        expect(hasDynamicActivator(targetOnly) && hasExplicitTarget(targetOnly)).toBe(false);

        const smallTrigger = '<v-menu v-model="open" activator="parent">';
        expect(hasDynamicActivator(smallTrigger) && hasExplicitTarget(smallTrigger)).toBe(false);

        const literalParent = '<v-menu v-model="open" :activator="\'parent\'" :target="pos">';
        expect(hasDynamicActivator(literalParent)).toBe(false);

        expect(isPersistent('<v-menu v-model="open" persistent activator="parent">')).toBe(true);
        expect(isPersistent('<v-menu v-model="open" activator="parent">')).toBe(false);

        expect(vMenuTags('<v-menu v-model="a" activator="parent">\n  x\n</v-menu>')).toHaveLength(
            1,
        );
        expect(vMenuTags("no menu here")).toHaveLength(0);
    });

    it(
        "catches the same collision when :activator/:target are single-quoted -- Vue's compiler " +
            "accepts either quote character identically, so a detector that only matched double " +
            "quotes would let the exact reported-bug shape back in under a different punctuation mark",
        () => {
            const singleQuotedBoth = '<v-menu v-model="open" :activator=\'root\' :target="pos">';
            expect(
                hasDynamicActivator(singleQuotedBoth) && hasExplicitTarget(singleQuotedBoth),
            ).toBe(true);

            const singleQuotedActivatorOnly = "<v-menu v-model=\"open\" :activator='root'>";
            expect(hasDynamicActivator(singleQuotedActivatorOnly)).toBe(true);
            expect(hasExplicitTarget(singleQuotedActivatorOnly)).toBe(false);

            const singleQuotedTargetOnly = "<v-menu v-model=\"open\" :target='pos'>";
            expect(hasExplicitTarget(singleQuotedTargetOnly)).toBe(true);
            expect(hasDynamicActivator(singleQuotedTargetOnly)).toBe(false);

            const singleQuotedLiteralParent =
                "<v-menu v-model=\"open\" :activator=\"'parent'\" :target='pos'>";
            expect(hasDynamicActivator(singleQuotedLiteralParent)).toBe(false);
        },
    );

    it("does not truncate the tag at a literal '>' inside an earlier attribute's quoted value", () => {
        // `:style="{ opacity: level > 2 ? 1 : 0.5 }"` is an ordinary bound comparison -- a
        // naive `indexOf(">", ...)` stops right there, chopping off every attribute that
        // follows, including :activator and :target. That hid the exact reported collision:
        // the truncated fragment still has SWEPT_V_MENU pick the file up (non-empty), but
        // fileCollides() never sees either attribute, so a broken menu reads as clean forever.
        const source =
            '<v-menu v-model="open" :style="{ opacity: level > 2 ? 1 : 0.5 }" ' +
            ':activator="root" :target="pos">';
        const tags = vMenuTags(source);
        expect(tags).toHaveLength(1);
        // The captured tag must run all the way to the real closing '>', not the one inside
        // :style -- proven by both trailing attributes still being present in the fragment.
        expect(tags[0]).toBe(source);
        expect(hasDynamicActivator(onlyTag(tags)) && hasExplicitTarget(onlyTag(tags))).toBe(true);

        // The same shape with no real collision (:target only, positioned by hand-wired ARIA)
        // must still be read past the embedded '>' rather than accidentally swallowing the
        // rest of the file -- the fix must not overcorrect into never stopping.
        const targetOnlyWithEmbeddedGt =
            '<v-menu v-model="open" :style="{ opacity: level > 2 ? 1 : 0.5 }" :target="pos">' +
            "\n  <span>after</span>\n</v-menu>";
        const targetOnlyTags = vMenuTags(targetOnlyWithEmbeddedGt);
        expect(targetOnlyTags).toHaveLength(1);
        expect(targetOnlyTags[0]).toBe(
            '<v-menu v-model="open" :style="{ opacity: level > 2 ? 1 : 0.5 }" :target="pos">',
        );
        expect(
            hasDynamicActivator(onlyTag(targetOnlyTags)) &&
                hasExplicitTarget(onlyTag(targetOnlyTags)),
        ).toBe(false);
    });

    it(
        "recognises <appearance-target> (kebab-case) exactly like <AppearanceTarget> (PascalCase) -- " +
            "Vue's SFC compiler resolves a locally-imported component by either spelling, so a page " +
            "written with the kebab-case tag is just as real an AppearanceTarget consumer as one " +
            "written PascalCase, and must not be invisible to the completeness guard below",
        () => {
            const pascal =
                '<AppearanceTarget id="new.page" :label="t(\'newPage\')">\n  content\n</AppearanceTarget>';
            expect(usesAppearanceTarget(pascal)).toBe(true);

            const kebab =
                '<appearance-target id="new.page" :label="t(\'newPage\')">\n  content\n</appearance-target>';
            expect(usesAppearanceTarget(kebab)).toBe(true);

            // A near-miss identifier must not false-positive the sweep either way.
            expect(usesAppearanceTarget("<AppearanceTargetSomethingElse>")).toBe(false);
            expect(usesAppearanceTarget("<appearance-target-something-else>")).toBe(false);
            expect(usesAppearanceTarget("no wrapper here")).toBe(false);
        },
    );

    it(
        "recognises <VMenu> (PascalCase) exactly like <v-menu> (kebab-case) -- Vue's SFC compiler " +
            "resolves both spellings to the same locally-imported component, so a scanner that only " +
            "matches the hyphenated form lets a PascalCase collision through undetected",
        () => {
            // Sanity: the two spellings really do refer to the same component under Vue's own rules.
            // `AppearanceTarget.vue` imports it as `VMenu` and every template in this package happens
            // to write `<v-menu>` -- that is a convention, not something Vue enforces.
            expect(read(APPEARANCE_TARGET_FILE)).toMatch(
                /import\s*\{[^}]*\bVMenu\b[^}]*\}\s*from\s*"vuetify\/components"/,
            );

            const pascalPlain = '<VMenu v-model="a" activator="parent">\n  x\n</VMenu>';
            expect(vMenuTags(pascalPlain)).toHaveLength(1);

            const pascalCollision =
                '<VMenu v-model="open" :activator="root ?? undefined" :target="pos">';
            const tags = vMenuTags(pascalCollision);
            expect(tags).toHaveLength(1);
            expect(hasDynamicActivator(onlyTag(tags)) && hasExplicitTarget(onlyTag(tags))).toBe(
                true,
            );

            // Camel-case (`<vMenu>`) and shout-case (`<V-MENU>`) are edge cases Vue's own resolver
            // also accepts; the scanner should not need updating the day someone writes one.
            expect(vMenuTags('<vMenu :activator="root" :target="pos">')).toHaveLength(1);
            expect(vMenuTags('<V-MENU :activator="root" :target="pos">')).toHaveLength(1);
        },
    );

    it(
        "catches a colliding activator/target written via v-bind object-spread, not only the literal " +
            ":activator=/:target= attribute syntax",
        () => {
            // Vue (and every Vuetify component prop, activator/target included) treats
            // `v-bind="{ ... }"` object-spread identically to spelling each key as its own
            // `:key="value"` binding. `v-bind="{ activator: root, target: pos }"` on <v-menu>
            // resolves activator/target exactly as `:activator="root" :target="pos"` would,
            // reproducing the exact "menu does not close on outside click" bug -- and this idiom
            // is already used elsewhere in this package (ProfileManager.vue, ProjectList.vue,
            // App.vue, ...), so it is a realistic, not contrived, way to reintroduce it.
            const spreadCollision =
                '<v-menu v-model="open" v-bind="{ activator: root, target: pos }">';
            const spreadTags = vMenuTags(spreadCollision);
            expect(spreadTags).toHaveLength(1);
            expect(
                hasDynamicActivator(onlyTag(spreadTags)) && hasExplicitTarget(onlyTag(spreadTags)),
            ).toBe(true);

            // :target alone via v-bind, no activator key at all, is exactly as safe as the
            // direct-attribute form -- the fix must not overcorrect into flagging every v-bind.
            const spreadTargetOnly = '<v-menu v-model="open" v-bind="{ target: pos }">';
            const targetOnlyTag = onlyTag(vMenuTags(spreadTargetOnly));
            expect(hasExplicitTarget(targetOnlyTag)).toBe(true);
            expect(hasDynamicActivator(targetOnlyTag)).toBe(false);

            // A literal 'parent' activator spread via v-bind stays exactly as safe as
            // :activator="'parent'" does.
            const spreadLiteralParent =
                '<v-menu v-model="open" v-bind="{ activator: \'parent\', target: pos }">';
            expect(hasDynamicActivator(onlyTag(vMenuTags(spreadLiteralParent)))).toBe(false);

            // A v-bind that spreads unrelated props (no activator/target keys, and near-miss
            // identifiers that merely contain "activator"/"target" as a substring) must not be
            // treated as a collision just because v-bind is present on the tag.
            const spreadUnrelated =
                '<v-menu v-model="open" v-bind="{ maxWidth: 320, deactivator: 1, retarget: 2 }" activator="parent">';
            const unrelatedTag = onlyTag(vMenuTags(spreadUnrelated));
            expect(hasDynamicActivator(unrelatedTag)).toBe(false);
            expect(hasExplicitTarget(unrelatedTag)).toBe(false);

            // Mixing forms -- a direct :activator attribute alongside a v-bind that separately
            // supplies :target -- is the same collision under a different disguise.
            const mixedForms = '<v-menu v-model="open" :activator="root" v-bind="{ target: pos }">';
            const mixedTag = onlyTag(vMenuTags(mixedForms));
            expect(hasDynamicActivator(mixedTag) && hasExplicitTarget(mixedTag)).toBe(true);
        },
    );
});

/* -------------------------------------------------------------------------- */
/* The declared inventory                                                     */
/* -------------------------------------------------------------------------- */

describe("overlayDismissalPolicy.ts: the declared inventory", () => {
    it("registers every file the sweep finds with a real <v-menu> tag", () => {
        const unregistered = [...SWEPT_V_MENU].filter(
            (file) => !registryByFile.has(file) || registryByFile.get(file)?.ownVMenu !== true,
        );
        expect(
            unregistered,
            "a new <v-menu> shipped without joining REGISTRY in overlayDismissalPolicy.test.ts " +
                "(ownVMenu: true). Add an entry for it before this can pass.",
        ).toEqual([]);
    });

    it("registers every file the sweep finds wrapped in <AppearanceTarget>", () => {
        const unregistered = [...APPEARANCE_TARGET_USERS].filter(
            (file) =>
                !registryByFile.has(file) ||
                registryByFile.get(file)?.wrapsAppearanceTarget !== true,
        );
        expect(
            unregistered,
            "a new AppearanceTarget-wrapped surface shipped without joining REGISTRY " +
                "(wrapsAppearanceTarget: true).",
        ).toEqual([]);
    });

    it("never lists an entry for a file that does not exist", () => {
        const missing = REGISTRY.filter((entry) => !VUE_FILES.includes(entry.file));
        expect(missing.map((entry) => entry.file)).toEqual([]);
    });

    it("never claims ownVMenu for a file the live sweep no longer finds a <v-menu> in", () => {
        const stale = REGISTRY.filter((entry) => entry.ownVMenu && !SWEPT_V_MENU.has(entry.file));
        expect(
            stale.map((entry) => entry.file),
            "the <v-menu> this entry described was removed or renamed. Update or remove the entry.",
        ).toEqual([]);
    });

    it("never claims wrapsAppearanceTarget for a file that no longer wraps one", () => {
        const stale = REGISTRY.filter(
            (entry) => entry.wrapsAppearanceTarget && !APPEARANCE_TARGET_USERS.has(entry.file),
        );
        expect(stale.map((entry) => entry.file)).toEqual([]);
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

    it("names an owner for every 'pending' entry", () => {
        const unowned = REGISTRY.filter(
            (entry) => entry.status === "pending" && (entry.owner ?? "").trim().length < 20,
        );
        expect(unowned.map((entry) => entry.file)).toEqual([]);
    });

    it("names a reason for every 'not-applicable' entry", () => {
        const unexplained = REGISTRY.filter(
            (entry) => entry.status === "not-applicable" && (entry.reason ?? "").trim().length < 20,
        );
        expect(unexplained.map((entry) => entry.file)).toEqual([]);
    });

    it("keeps a 'clean' entry clean, so a regression on an already-fixed surface cannot hide", () => {
        const regressed = REGISTRY.filter((entry) => entry.status === "clean" && isBroken(entry));
        expect(
            regressed.map((entry) => entry.file),
            "this surface was marked clean, but the live sweep now finds its mechanism broken " +
                "again -- either the fix was reverted, or something new collides.",
        ).toEqual([]);
    });

    it("promotes a 'pending' entry the moment its fix actually lands, rather than trusting the label", () => {
        const stalePending = REGISTRY.filter(
            (entry) => entry.status === "pending" && !isBroken(entry),
        );
        expect(
            stalePending.map((entry) => entry.file),
            "this entry is still marked 'pending' but the live sweep no longer finds it broken. " +
                "The fix landed -- flip its status to 'clean' rather than leaving the registry " +
                "stale.",
        ).toEqual([]);
    });

    it("only exercises three statuses, so a typo cannot silently mean 'skip this row'", () => {
        const STATUSES: readonly Status[] = ["clean", "pending", "not-applicable"];
        for (const entry of REGISTRY) {
            expect(STATUSES, entry.file).toContain(entry.status);
        }
    });
});
