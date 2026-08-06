/**
 * The site package's own copy of "right click menu not closing when clicking off the menu" --
 * the same bug class `packages/ui`'s `overlayDismissalPolicy.test.ts` guards there, kept fixed
 * here too because this package renders its own overlays with its own primitive rather than
 * Vuetify's.
 *
 * ## The mechanism
 *
 * Every anchored popover on the site (a context menu, the appearance editor, a colour or font
 * picker, the changelog date range, every search bar's regex builder) is built on one shared
 * class, `AnchoredPanel` (`./anchoredPanel.ts`). Its outside-click handler used to read:
 *
 * ```
 * if (this.element.contains(target) || this.options.anchor.contains(target)) return;
 * this.close();
 * ```
 *
 * `anchor` is "the control the panel hangs off" -- for a small toggle button that is exactly
 * right (a second click on the same button must not close-then-reopen the panel), but
 * `openAppearanceEditor` passes the *live element being edited* as `anchor`, purely to position
 * the editor beside it. For a page-root-sized element that made almost every click on the page
 * count as "inside", and the editor could not be dismissed by clicking away -- the reported bug,
 * reproduced in this package's own primitive rather than Vuetify's.
 *
 * The fix adds `dismissBoundary`, defaulting to `anchor` (correct for a small toggle) but
 * settable to `null` when `anchor` is only a position reference: `openAppearanceEditor` now
 * passes `dismissBoundary: null` explicitly, with a comment on the option itself explaining
 * why. See `anchoredPanel.ts`'s own `AnchoredPanelOptions.dismissBoundary` doc for the source
 * of truth this file checks against.
 *
 * ## The two-part guard
 *
 *  1. **The structural sweep.** Every `new AnchoredPanel({ ... })` construction in
 *     `packages/site/src` is found by text search and must be named in {@link REGISTRY} below.
 *     A new call site that joins the list of five below without an entry fails this file, the
 *     same way a new `<v-menu>` fails the UI package's equivalent guard. The search resolves a
 *     call site written through an import alias (`import { AnchoredPanel as Panel } from
 *     "./anchoredPanel.js"`) back to `AnchoredPanel` from the file's own import statement, rather
 *     than only ever matching the literal identifier `AnchoredPanel` -- see
 *     {@link anchoredPanelLocalNames} below for why that resolution is load-bearing, not
 *     decoration.
 *  2. **The declared inventory.** Each call site is classified as one of two shapes, checked
 *     against its own real source rather than trusted:
 *       - `"explicit-null"` -- the call itself sets `dismissBoundary: null`, verified by
 *         grepping the actual construction for that exact text. This is what
 *         `openAppearanceEditor` does, because its anchor is the (possibly huge) element being
 *         edited.
 *       - `"small-anchor"` -- the call relies on the safe default (no `dismissBoundary` key at
 *         all), which is only correct when `anchor` is a small dedicated trigger the panel
 *         itself owns. Since a static sweep cannot measure an element's rendered size, this
 *         status requires a written justification of at least 40 characters naming what the
 *         anchor actually is and why it is not a broad wrapper -- the same discipline
 *         `pathFieldPolicy.test.ts`'s `PATH_FIELD_EXEMPTIONS` already asks for, and it is
 *         checked to make sure it does NOT also carry `dismissBoundary: null` (that would be a
 *         mislabelled `"explicit-null"` entry, not a genuine default).
 *     `"pending"` is available, with a required owner, for a call site a future pass finds
 *     broken but does not own; none exist today.
 *
 * This file is deliberately not in the jsdom environment: under jsdom `import.meta.url` is not
 * a `file:` URL, so `fileURLToPath` throws before a single assertion runs -- the same reason
 * `destructiveActionPolicy.test.ts` and `notificationPolicy.test.ts` in this package stay out
 * of it too. It only ever reads source text.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** `packages/site/src`, two levels above this file (`search/anchoredPanelDismissalPolicy.test.ts`). */
const siteSource = fileURLToPath(new URL("..", import.meta.url));

function sourceFiles(dir: string, extensions: readonly string[]): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === "dist") continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory()) found.push(...sourceFiles(path, extensions));
        else if (extensions.some((extension) => name.endsWith(extension))) found.push(path);
    }
    return found;
}

function relativeToSource(path: string): string {
    return relative(siteSource, path).replaceAll("\\", "/");
}

function read(path: string): string {
    return readFileSync(join(siteSource, path), "utf8");
}

/* -------------------------------------------------------------------------- */
/* The structural sweep: every `new AnchoredPanel({ ... })` construction      */
/* -------------------------------------------------------------------------- */

/**
 * Every local identifier that `source`'s own import statements bind to the real `AnchoredPanel`
 * class, plus the literal name `"AnchoredPanel"` itself -- the latter both covers an unaliased
 * import (the ordinary case, where the local name and the exported name are the same word) and
 * this file's own inline test fixtures a few lines below, which construct the panel directly
 * with no import statement at all.
 *
 * `import { AnchoredPanel as Panel } from "./anchoredPanel.js"` is completely ordinary,
 * TypeScript-legal syntax with zero effect on runtime behaviour, and nothing in the toolchain
 * forbids it. A sweep that only ever looked for the literal text `"new AnchoredPanel("` would
 * never see `new Panel(...)`, so resolving the alias here -- from the same import clause the
 * TypeScript compiler itself resolves it from -- is what keeps the sweep honest against a rename.
 */
function anchoredPanelLocalNames(source: string): string[] {
    const names = new Set<string>(["AnchoredPanel"]);
    const importClause = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["'][^"']*["']/g;
    for (const [, specifiers] of source.matchAll(importClause)) {
        // A capture group is typed as possibly undefined even when, as here, the pattern
        // cannot match without it. Skip rather than assert, so a future edit to the pattern
        // that genuinely makes the group optional degrades quietly instead of throwing.
        if (specifiers === undefined) continue;
        for (const specifier of specifiers.split(",")) {
            const alias = /^\s*AnchoredPanel(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(specifier);
            if (alias) names.add(alias[1] ?? "AnchoredPanel");
        }
    }
    return [...names];
}

/**
 * Every `new AnchoredPanel({ ... })` call in `source` (or `new <alias>({ ... })`, per
 * {@link anchoredPanelLocalNames} above), as the raw text from `new <name>` up to (and
 * including) the matching close paren -- a plain depth-counted brace/paren scan rather than a
 * regex, because the options object nearly always spans several lines and can itself contain
 * nested braces (an `onClose` callback, an object literal for `anchor`'s own construction a few
 * lines above).
 */
function anchoredPanelConstructions(source: string): string[] {
    const found: { start: number; text: string }[] = [];
    for (const localName of anchoredPanelLocalNames(source)) {
        const NEEDLE = `new ${localName}(`;
        let searchFrom = 0;
        for (;;) {
            const start = source.indexOf(NEEDLE, searchFrom);
            if (start === -1) break;
            let depth = 0;
            let end = -1;
            for (let index = start + NEEDLE.length - 1; index < source.length; index += 1) {
                const char = source[index];
                if (char === "(") depth += 1;
                else if (char === ")") {
                    depth -= 1;
                    if (depth === 0) {
                        end = index;
                        break;
                    }
                }
            }
            if (end === -1) break;
            found.push({ start, text: source.slice(start, end + 1) });
            searchFrom = end + 1;
        }
    }
    found.sort((a, b) => a.start - b.start);
    return found.map((entry) => entry.text);
}

/** How many `new AnchoredPanel(` constructions each file has, counted the same way. */
function countConstructions(file: string): number {
    return anchoredPanelConstructions(read(file)).length;
}

/** Every file under `packages/site/src` (excluding this guard and the primitive itself) with at least one construction. */
const SITE_FILES = sourceFiles(siteSource, [".ts"])
    .map(relativeToSource)
    .filter((file) => file !== "search/anchoredPanel.ts" && !file.endsWith(".test.ts"));

const SWEPT_FILES = new Set(SITE_FILES.filter((file) => countConstructions(file) > 0));

/** Whether any construction in `source` sets `dismissBoundary: null` verbatim. */
function sourceHasExplicitNull(source: string): boolean {
    return anchoredPanelConstructions(source).some((block) => /dismissBoundary\s*:\s*null\b/.test(block));
}

/** Whether any construction in `file` sets `dismissBoundary: null` verbatim. */
function hasExplicitNull(file: string): boolean {
    return sourceHasExplicitNull(read(file));
}

/* -------------------------------------------------------------------------- */
/* The declared inventory                                                     */
/* -------------------------------------------------------------------------- */

type Status = "explicit-null" | "small-anchor" | "pending";

interface AnchoredPanelEntry {
    readonly file: string;
    /** How many `new AnchoredPanel(...)` constructions this file has. */
    readonly count: number;
    readonly surface: string;
    readonly status: Status;
    /** Required, and asserted >= 40 characters, when `status` is `"small-anchor"`. */
    readonly reason?: string;
    /** Required, and asserted non-empty, when `status` is `"pending"`. */
    readonly owner?: string;
}

const REGISTRY: readonly AnchoredPanelEntry[] = [
    {
        file: "appearance/editor/appearanceEditor.ts",
        count: 1,
        surface: "The non-modal appearance editor, opened beside the element being styled.",
        status: "explicit-null",
    },
    {
        file: "appearance/editor/contextMenu.ts",
        count: 1,
        surface: "The right-click 'Edit appearance...' menu, opened at the pointer or the element.",
        status: "small-anchor",
        reason:
            "anchor is a zero-size <span class=\"mb-pointer-anchor\"> created fresh on every " +
            "open and appended to <body> purely as a position reference for the pointer (or, " +
            "for the keyboard path, the target element's own bounding rect) -- never the wrapped " +
            "surface itself, so treating it as included changes nothing a real click could ever " +
            "land inside besides itself.",
    },
    {
        file: "appearance/editor/controls.ts",
        count: 2,
        surface:
            "colorRow()'s colour-swatch popover and fontRow()'s font-family list popover, both " +
            "on the settings/appearance-editor forms.",
        status: "small-anchor",
        reason:
            "Both constructions anchor to `trigger`, a dedicated <button> this same function " +
            "creates a few lines above purely to open the popover (a colour swatch button, a " +
            "font-name button) -- never the row or the form around it.",
    },
    {
        file: "content/dateRangePicker.ts",
        count: 1,
        surface: "The changelog viewer's advanced calendar popover.",
        status: "small-anchor",
        reason:
            "Anchors to `button`, the one <button class=\"md-button ...\"> this function creates " +
            "to open the calendar -- never the date-range control's row or the changelog " +
            "toolbar it sits in.",
    },
    {
        file: "search/builderPanel.ts",
        count: 1,
        surface:
            "The shared regex-builder popover behind every search bar's 'open the regex " +
            "builder' button (bound via attachBuilder.ts's `anchor: button`).",
        status: "small-anchor",
        reason:
            "`options.anchor` is a passthrough of createBuilderController's own caller-supplied " +
            "anchor, and its only caller (attachBuilder.ts) passes `button`, the small dedicated " +
            "'open the regex builder' icon button beside the field -- never the search field or " +
            "the surface the field lives on.",
    },
] as const;

const registryByFile = new Map(REGISTRY.map((entry) => [entry.file, entry]));

/* -------------------------------------------------------------------------- */
/* The mechanism sweep                                                        */
/* -------------------------------------------------------------------------- */

describe("anchoredPanelDismissalPolicy.ts: the mechanism sweep", () => {
    it("finds the surfaces it is supposed to be watching", () => {
        expect(SITE_FILES.length).toBeGreaterThan(20);
        expect(SWEPT_FILES.size).toBeGreaterThan(2);
    });

    it("correctly counts a construction, including one whose options object has nested braces", () => {
        const nested = `
            const panel = new AnchoredPanel({
                anchor: el("button", { class: "x" }),
                onClose: () => {
                    if (open) { closeMenu(); }
                },
            });
        `;
        expect(anchoredPanelConstructions(nested)).toHaveLength(1);
        expect(anchoredPanelConstructions(nested)[0]).toContain("onClose");
        expect(anchoredPanelConstructions("no panel here")).toHaveLength(0);

        expect(sourceHasExplicitNull("new AnchoredPanel({ anchor: a, dismissBoundary: null })")).toBe(true);
        expect(sourceHasExplicitNull("new AnchoredPanel({ anchor: a })")).toBe(false);
    });

    it("still finds a construction when the class is imported under a different local name", () => {
        // `import { AnchoredPanel as Panel }` is completely ordinary, TypeScript-legal syntax --
        // nothing in the toolchain forbids it -- and has zero effect on runtime behaviour. A sweep
        // that only ever searches for the literal text "new AnchoredPanel(" never sees a
        // `new Panel(...)` call site, so it silently never enters SWEPT_FILES, never needs a
        // REGISTRY entry, and the "registers every file the sweep finds" check has nothing to
        // compare against -- a panel anchored to a large element with no dismissBoundary override
        // (the exact reported-bug shape this file exists to catch) would ship guard-green.
        const aliased = `
            import { AnchoredPanel as Panel } from "./anchoredPanel.js";
            const panel = new Panel({ anchor: bigWrapperElement });
        `;
        expect(anchoredPanelConstructions(aliased)).toHaveLength(1);
        expect(anchoredPanelConstructions(aliased)[0]).toContain("bigWrapperElement");
    });
});

describe("anchoredPanelDismissalPolicy.ts: the declared inventory", () => {
    it("registers every file the sweep finds constructing an AnchoredPanel", () => {
        const unregistered = [...SWEPT_FILES].filter((file) => !registryByFile.has(file));
        expect(
            unregistered,
            "a new `new AnchoredPanel(...)` call shipped without joining REGISTRY in " +
                "anchoredPanelDismissalPolicy.test.ts. Name it 'explicit-null' (verified by the " +
                "construction itself setting dismissBoundary: null), or 'small-anchor' with a " +
                "written reason the anchor is a dedicated small control rather than a broad " +
                "wrapper -- see anchoredPanel.ts's own AnchoredPanelOptions.dismissBoundary doc " +
                "for why the distinction matters.",
        ).toEqual([]);
    });

    it("never lists an entry for a file that no longer constructs an AnchoredPanel", () => {
        const stale = REGISTRY.filter((entry) => !SWEPT_FILES.has(entry.file));
        expect(stale.map((entry) => entry.file)).toEqual([]);
    });

    it("counts the same number of constructions in each file, so a new one cannot hide beside a known one", () => {
        const drifted = REGISTRY.filter((entry) => countConstructions(entry.file) !== entry.count).map(
            (entry) => `${entry.file}: declared ${entry.count}, found ${countConstructions(entry.file)}`,
        );
        expect(
            drifted,
            "a file gained or lost an AnchoredPanel construction. Update REGISTRY's count, and " +
                "if one was added, make sure its own dismissal shape is covered by the file's " +
                "existing status (or split it into its own entry if it needs a different one).",
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

    it("verifies every 'explicit-null' entry actually sets dismissBoundary: null, in the real source", () => {
        const unverified = REGISTRY.filter((entry) => entry.status === "explicit-null" && !hasExplicitNull(entry.file));
        expect(
            unverified.map((entry) => entry.file),
            "declared 'explicit-null' but the construction does not set dismissBoundary: null.",
        ).toEqual([]);
    });

    it("writes a real reason for every 'small-anchor' entry, and never lets it also claim dismissBoundary: null", () => {
        for (const entry of REGISTRY) {
            if (entry.status !== "small-anchor") continue;
            expect((entry.reason ?? "").length, `${entry.file} needs a real reason, not a placeholder`).toBeGreaterThanOrEqual(40);
            expect(
                hasExplicitNull(entry.file),
                `${entry.file} is classified 'small-anchor' but its construction sets ` +
                    "dismissBoundary: null -- that is an 'explicit-null' entry, not a default.",
            ).toBe(false);
        }
    });

    it("names an owner for every 'pending' entry", () => {
        const unowned = REGISTRY.filter((entry) => entry.status === "pending" && (entry.owner ?? "").trim().length < 20);
        expect(unowned.map((entry) => entry.file)).toEqual([]);
    });

    it("keeps this package's dismissal-boundary contract documented at the primitive itself", () => {
        // The registry's whole "small-anchor" story rests on `dismissBoundary` defaulting to
        // `anchor` and on `null` being the documented escape hatch; if the primitive's own
        // shape changes, this assumption needs re-checking rather than silently going stale.
        const primitive = read("search/anchoredPanel.ts");
        expect(primitive).toContain("dismissBoundary?: HTMLElement | null");
        expect(primitive).toContain(
            "options.dismissBoundary === undefined ? options.anchor : options.dismissBoundary",
        );
    });
});
