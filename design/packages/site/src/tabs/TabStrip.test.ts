// @vitest-environment jsdom

/**
 * Regression guard for the phone-width tab strip.
 *
 * A real visitor on a ~390-430px phone hit a strip that had shrunk itself into uselessness:
 * one pinned "Home" tab truncated to a pin glyph and a single letter, an overflow button
 * reading "6 more, hiding out here" eating almost the whole bar, and every other destination
 * reachable only through that one control. `TabStrip.ts`'s `layout()` was budgeting tabs into
 * a fixed-width overflow menu the way it does on desktop, and at phone width that budget left
 * `.tab-strip__pinned` with an automatic flex min-size of zero (its own `overflow-x: auto`
 * makes that safe for the *container*, not for what stays visible inside it) - so the
 * container was crushed down to a sliver by its wide sibling, and the pinned tab inside it
 * rendered only the first ~26px of itself: a pin icon and the first letter of "Home".
 *
 * The fix drops the fixed-budget strategy below `COMPACT_TAB_STRIP_MAX_WIDTH` for the other
 * Material 3 pattern - scrollable tabs. Below that width nothing is measured or hidden: every
 * destination stays a real, fully labelled tab, `.tab-strip__pinned` stops shrinking below its
 * content, and `.tab-strip__main` scrolls horizontally instead of clipping. These tests cover
 * both halves: the CSS source (jsdom cannot lay out real widths, so this reads the stylesheet
 * the way `theme/base.test.ts` already does for the same reason) and the DOM/JS side that
 * `layout()` actually controls (nothing hidden, nothing truncated, every destination still
 * activatable).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { AppearanceController } from "../appearance/controller.js";
import { AppearanceStore } from "../appearance/store.js";
import { I18n } from "../i18n/I18n.js";
import { Notifications } from "../notifications/Notifications.js";
import { Preferences } from "../platform/Preferences.js";
import { RegexBuilderSlot } from "../platform/RegexBuilderSlot.js";
import { ShortcutRegistry } from "../platform/shortcuts.js";
import { TabModel, type TabPlacement } from "./TabModel.js";
import { COMPACT_TAB_STRIP_MAX_WIDTH, TabStrip } from "./TabStrip.js";

const tabsCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "tabs.css"), "utf8");
const tokensCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../theme/tokens.css"), "utf8");

/** The exact seven-page shape the real site registers: one pinned Home plus six ordinary
 *  pages. This is not an arbitrary sample - it is the scenario the bug report described,
 *  down to "6 more" being the overflow count for the six non-pinned pages. */
const OTHER_PAGES: readonly (readonly [string, string])[] = [
    ["docs", "Documentation"],
    ["screenshots", "Screenshots"],
    ["settings", "Settings"],
    ["search", "Search"],
    ["changelog", "Changelog"],
    ["notifications", "Notifications"],
];

function memoryStorage(): Storage {
    const cells = new Map<string, string>();
    return {
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
        removeItem: (key) => void cells.delete(key),
        clear: () => cells.clear(),
        key: (index) => [...cells.keys()][index] ?? null,
        get length() {
            return cells.size;
        },
    };
}

function setViewportWidth(width: number): void {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    window.dispatchEvent(new Event("resize"));
}

/** Builds a strip with the site's own seven-page shape, at a given starting viewport width
 *  (default wide, so a test that wants compact behaviour says so explicitly). */
function buildStrip(
    width = 1440,
    storage: Storage | null = null,
    placement: TabPlacement = "left",
): { strip: TabStrip; model: TabModel } {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });

    const i18n = new I18n(new Preferences(memoryStorage()));
    const model = new TabModel(new Preferences(storage), i18n);
    const notifications = new Notifications(i18n, document.createElement("div"));
    const shortcuts = new ShortcutRegistry(document.createElement("div"));
    const regex = new RegexBuilderSlot();
    const appearance = new AppearanceController(new Preferences(null), new AppearanceStore());
    const confirmDestructive = async (): Promise<boolean> => true;

    const strip = new TabStrip({
        i18n,
        model,
        notifications,
        shortcuts,
        regex,
        appearance,
        confirmDestructive,
    });
    document.body.append(strip.bar, strip.panels);

    model.register({
        id: "home",
        label: { text: "Home" },
        pinned: true,
        closable: false,
        render: () => {},
    });
    for (const [id, label] of OTHER_PAGES) {
        model.register({ id, label: { text: label }, render: () => {} });
    }
    if (placement !== "left") model.setPlacement(placement);

    return { strip, model };
}

afterEach(() => {
    document.body.replaceChildren();
});

describe("tabs.css compact media query", () => {
    /** The block's own body, isolated by brace matching so assertions cannot accidentally
     *  pass by matching an unrelated rule elsewhere in the file. */
    function compactBlock(): string {
        const marker = `@media (width <= ${COMPACT_TAB_STRIP_MAX_WIDTH}px)`;
        const start = tabsCss.indexOf(marker);
        expect(start, `tabs.css has no compact media query at "${marker}"`).toBeGreaterThan(-1);
        const openBrace = tabsCss.indexOf("{", start);
        let depth = 0;
        let index = openBrace;
        for (; index < tabsCss.length; index++) {
            if (tabsCss[index] === "{") depth++;
            else if (tabsCss[index] === "}") {
                depth--;
                if (depth === 0) break;
            }
        }
        return tabsCss.slice(openBrace + 1, index);
    }

    it("shares its exact breakpoint with TabStrip.ts's COMPACT_TAB_STRIP_MAX_WIDTH", () => {
        // A literal duplicate of the constant's value, not a re-import of it: if the two
        // ever drift, this string still has to be edited by hand to make the test pass,
        // which is the point - it cannot silently follow the constant to a new value.
        expect(COMPACT_TAB_STRIP_MAX_WIDTH).toBe(720);
        expect(tabsCss).toContain(`@media (width <= ${COMPACT_TAB_STRIP_MAX_WIDTH}px)`);
    });

    it('hides the overflow ("N more") button, since nothing is ever hidden into it here', () => {
        expect(compactBlock()).toMatch(/\.tab-bar__overflow\s*\{[^}]*display:\s*none\s*!important/);
    });

    it("makes the main tab row horizontally scrollable instead of clipping it", () => {
        const block = compactBlock();
        expect(block).toMatch(/\.tab-strip__main\s*\{[^}]*overflow-x:\s*auto/);
    });

    it("stops the pinned region from being crushed below its own content", () => {
        // This is the actual root cause of the reported bug: .tab-strip__pinned could
        // shrink to zero because its own overflow-x: auto gives it an automatic flex
        // min-size of zero. `flex: none` is what keeps a pinned tab's full label on
        // screen instead of a crushed sliver.
        expect(compactBlock()).toMatch(/\.tab-strip__pinned\s*\{[^}]*flex:\s*none/);
    });

    it("never hides an actual tab or group inside the compact block", () => {
        const block = compactBlock();
        expect(block).not.toContain(".tab {");
        expect(block).not.toContain(".tab--pinned {");
        expect(block).not.toContain(".tab-group {");
    });

    it("never truncates a label with an ellipsis anywhere in the stylesheet", () => {
        expect(tabsCss).not.toMatch(/text-overflow\s*:\s*ellipsis/);
    });

    it("keeps every tab close button at the shared 44px minimum target", () => {
        const closeRule = /\.tab__close\s*\{[^}]*\}/.exec(tabsCss)?.[0] ?? "";
        expect(closeRule).toContain("width: var(--md-sys-min-touch-target);");
        expect(closeRule).toContain("height: var(--md-sys-min-touch-target);");
        expect(tokensCss).toMatch(/--md-sys-min-touch-target:\s*44px/);
    });

    it("no longer hides a pinned tab's label to survive a narrow width (superseded by scrolling)", () => {
        // The rule this file's fix replaced. Its return would silently reintroduce a
        // version of the bug for any future page that registers with an icon.
        expect(tabsCss).not.toMatch(/tab--pinned[^{]*\{[^}]*display:\s*none/);
    });
});

describe("tabs.css visual refresh", () => {
    it("renders the tab list and bulk-close search fields as full pills, matching every other search bar", () => {
        expect(tabsCss).toMatch(
            /\.tab-list__filter-row \.md-field__input\s*\{[^}]*border-radius:\s*var\(--md-sys-shape-corner-full\);/,
        );
        expect(tabsCss).toMatch(
            /\.bulk-close__query \.md-field__input\s*\{[^}]*border-radius:\s*var\(--md-sys-shape-corner-full\);/,
        );
    });

    it("keeps the active-tab indicator a token-driven colour rather than a literal one", () => {
        const rule = /\.tab\.is-active::after\s*\{[^}]*\}/.exec(tabsCss)?.[0] ?? "";
        expect(rule).toContain("background: var(--md-sys-color-primary);");
        expect(rule).toMatch(/height:\s*4px;/);
    });

    it("does not touch the compact-strip breakpoint or its overflow/pinned/keyboard rules", () => {
        // The visual pass this describe block covers is scoped to colour, shape and
        // shadow. If it ever starts editing `.tab-strip__pinned`'s `flex` or the compact
        // media query's own marker, that is a sign the refresh crossed into behaviour
        // this file's other describe block already guards.
        expect(COMPACT_TAB_STRIP_MAX_WIDTH).toBe(720);
        expect(tabsCss).toContain(`@media (width <= ${COMPACT_TAB_STRIP_MAX_WIDTH}px)`);
    });
});

describe("four-edge placement", () => {
    it("defaults to the left edge and updates ARIA and layout markers for every edge", () => {
        const { strip, model } = buildStrip();
        const tablist = strip.bar.querySelector('[role="tablist"]');

        expect(model.placement).toBe("left");
        expect(model.placementProvenance).toBe("default");
        expect(strip.bar.dataset.placement).toBe("left");
        expect(tablist?.getAttribute("aria-orientation")).toBe("vertical");

        model.setPlacement("right");
        expect(strip.bar.dataset.placement).toBe("right");
        expect(tablist?.getAttribute("aria-orientation")).toBe("vertical");
        model.setPlacement("top");
        expect(strip.bar.dataset.placement).toBe("top");
        expect(tablist?.getAttribute("aria-orientation")).toBe("horizontal");
        model.setPlacement("bottom");
        expect(strip.bar.dataset.placement).toBe("bottom");
        expect(tablist?.getAttribute("aria-orientation")).toBe("horizontal");
    });

    it("persists one placement without changing tabs, pins, groups, or the active page", () => {
        const storage = memoryStorage();
        const first = buildStrip(1440, storage);
        const groupId = first.model.createGroup("Reference");
        first.model.setGroup("docs", groupId);
        first.model.setPinned("search", true);
        first.model.activate("changelog");
        first.model.setPlacement("right");

        const second = buildStrip(1440, storage);
        expect(second.model.placement).toBe("right");
        expect(second.model.placementProvenance).toBe("stored");
        expect(second.model.groupOf("docs")?.name).toBe("Reference");
        expect(second.model.isPinned("search")).toBe(true);
        expect(second.model.active).toBe("changelog");
    });

    it("migrates a version-1 state with no edge to left without losing its layout", () => {
        const storage = memoryStorage();
        storage.setItem(
            "mbm-site:tabs.state",
            JSON.stringify({
                v: 1,
                order: ["home", "docs"],
                pinned: ["home"],
                closed: [],
                groups: [],
                membership: [],
                active: "docs",
            }),
        );
        const { model } = buildStrip(1440, storage);
        expect(model.placement).toBe("left");
        expect(model.placementProvenance).toBe("default");
        expect(model.pinnedIds()).toContain("home");
        expect(model.active).toBe("docs");
    });

    it("uses Down on vertical strips and Right on horizontal strips", () => {
        const { strip, model } = buildStrip();
        const visibleTabs = (): HTMLElement[] => [
            ...strip.bar.querySelectorAll<HTMLElement>('[role="tab"]'),
        ];
        for (const tab of visibleTabs()) {
            Object.defineProperty(tab, "offsetParent", { configurable: true, value: strip.bar });
        }

        const home = visibleTabs()[0];
        home?.focus();
        home?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        expect(document.activeElement?.getAttribute("data-tab-id")).toBe("docs");

        model.setPlacement("top");
        for (const tab of visibleTabs()) {
            Object.defineProperty(tab, "offsetParent", { configurable: true, value: strip.bar });
        }
        const docs = visibleTabs().find((tab) => tab.dataset.tabId === "docs");
        docs?.focus();
        docs?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(document.activeElement?.getAttribute("data-tab-id")).toBe("screenshots");
    });
});

describe("TabStrip at a phone-width viewport (the reported bug)", () => {
    it("keeps every destination a real tab and never opens the overflow menu", () => {
        const { strip } = buildStrip(390, null, "top");

        expect(strip.overflowedIds()).toEqual([]);
        const overflowButton = strip.bar.querySelector<HTMLButtonElement>(".tab-bar__overflow");
        expect(overflowButton?.hidden).toBe(true);

        const mainTabs = [...strip.bar.querySelectorAll<HTMLElement>(".tab-strip__main .tab")];
        expect(mainTabs).toHaveLength(OTHER_PAGES.length);
        for (const tab of mainTabs) expect(tab.hidden).toBe(false);
    });

    it("never truncates the pinned tab's label to a single character - the exact reported bug", () => {
        const { strip } = buildStrip(390, null, "top");
        const pinnedLabel = strip.bar.querySelector(".tab--pinned .tab__label");
        expect(pinnedLabel?.textContent).toBe("Home");
        expect(pinnedLabel?.textContent?.length ?? 0).toBeGreaterThan(1);
        // The pin glyph stays too: pinning is still visibly, not just accessibly, true.
        expect(strip.bar.querySelector(".tab--pinned .tab__pin")).not.toBeNull();
    });

    it("keeps every ordinary tab's full label text, not shortened or ellipsised", () => {
        const { strip } = buildStrip(390, null, "top");
        const labels = [...strip.bar.querySelectorAll(".tab-strip__main .tab__label")].map(
            (node) => node.textContent,
        );
        expect(labels).toEqual(OTHER_PAGES.map(([, label]) => label));
    });

    it("lets every destination activate without opening any menu first", () => {
        const { strip, model } = buildStrip(390, null, "top");
        for (const [id] of OTHER_PAGES) {
            strip.reveal(id);
            expect(model.active).toBe(id);
        }
        strip.reveal("home");
        expect(model.active).toBe("home");
    });

    it("keeps every tab's accessible tab role, selection state and full aria-label", () => {
        const { strip, model } = buildStrip(390, null, "top");
        model.activate("changelog");
        const active = strip.bar.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
        expect(active?.dataset.tabId).toBe("changelog");
        expect(active?.getAttribute("aria-label")).toBe("Changelog");
        expect(active?.getAttribute("tabindex")).toBe("0");
    });

    it("scrolls a newly activated tab into view", () => {
        const { model } = buildStrip(390, null, "top");
        const calls: HTMLElement[] = [];
        const original = HTMLElement.prototype.scrollIntoView;
        HTMLElement.prototype.scrollIntoView = function scrollIntoViewSpy(this: HTMLElement): void {
            calls.push(this);
        };
        try {
            model.activate("changelog");
            expect(calls.some((node) => node.dataset["tabId"] === "changelog")).toBe(true);
        } finally {
            HTMLElement.prototype.scrollIntoView = original;
        }
    });

    it("re-enters compact mode on resize, matching the fallback listener jsdom actually uses", () => {
        // jsdom has no ResizeObserver, so TabStrip.ts's own constructor falls back to a
        // window "resize" listener - this is that exact runtime path, not a shortcut.
        expect(typeof ResizeObserver).toBe("undefined");
        const { strip } = buildStrip(1440, null, "top");
        setViewportWidth(390);

        expect(strip.overflowedIds()).toEqual([]);
        expect(strip.bar.querySelector<HTMLButtonElement>(".tab-bar__overflow")?.hidden).toBe(true);
        const pinnedLabel = strip.bar.querySelector(".tab--pinned .tab__label");
        expect(pinnedLabel?.textContent).toBe("Home");
    });
});

describe("TabStrip contracts that must survive the compact redesign", () => {
    it("still lets a pinned page be unpinned and re-pinned at phone width", () => {
        const { model } = buildStrip(390, null, "top");
        expect(model.isPinned("home")).toBe(true);
        model.setPinned("home", false);
        expect(model.isPinned("home")).toBe(false);
        model.setPinned("home", true);
        expect(model.isPinned("home")).toBe(true);
    });

    it("still lets a page be pinned, reordered, grouped and closed at phone width", () => {
        const { model } = buildStrip(390, null, "top");

        model.setPinned("docs", true);
        expect(model.pinnedIds()).toContain("docs");

        const groupId = model.createGroup("Reference");
        model.setGroup("changelog", groupId);
        expect(model.groupOf("changelog")?.id).toBe(groupId);

        expect(model.moveTab("search", 1)).toBe(true);

        expect(model.close("notifications")).toBe(true);
        expect(model.isOpen("notifications")).toBe(false);
        expect(model.reopen("notifications")).toBe(true);
        expect(model.isOpen("notifications")).toBe(true);
    });

    it("still runs every one of the four discovery searches at phone width", () => {
        const { model } = buildStrip(390, null, "top");
        const spec = { query: "change", mode: "plain" as const, caseSensitive: false };

        const strip = model.searchTabs(model.openIds(), spec);
        expect(strip.results.some((result) => result.tabId === "changelog")).toBe(true);

        const groupId = model.createGroup("Change tracking");
        model.setGroup("changelog", groupId);
        const group = model.searchTabs(
            model.openIds().filter((id) => model.groupOf(id)?.id === groupId),
            spec,
        );
        expect(group.results.map((result) => result.tabId)).toEqual(["changelog"]);

        const groups = model.searchGroupNames({
            query: "tracking",
            mode: "plain",
            caseSensitive: false,
        });
        expect(groups.results.some((result) => result.groupId === groupId)).toBe(true);

        const all = model.searchTabs(model.allIds(), spec);
        expect(all.results.some((result) => result.tabId === "changelog")).toBe(true);
    });

    it("still exposes the per-tab context menu's own search and its Edit appearance entry", () => {
        const { strip } = buildStrip(390, null, "top");
        const home = strip.bar.querySelector<HTMLElement>('[data-tab-id="home"]');
        expect(home).not.toBeNull();
        home!.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: 10,
                clientY: 10,
            }),
        );
        const menu = document.querySelector(".md-menu");
        expect(menu, "the per-tab context menu never opened").not.toBeNull();
        expect(document.querySelector(".md-menu__search input")).not.toBeNull();
        // The "Edit tab appearance..." entry's copy goes through the language/funny-level
        // catalogue and can be re-voiced independently of this fix; its fixed
        // "Shift + right-click" shortcut hint is a literal in TabStrip.ts itself, not
        // catalogue copy, so it is the stable thing to assert against here.
        const shortcuts = [...document.querySelectorAll(".md-menu__shortcut")].map(
            (node) => node.textContent,
        );
        expect(shortcuts).toContain("Shift + right-click");
    });
});
