/**
 * Integration contract for `@material-bluemap/site` search surfaces.
 *
 * This file is the single agreed boundary between the search module (which owns every search
 * bar, the regex builder, and both bulk-close actions) and the rest of the site:
 *
 *   - the tabs module owns tab state and supplies a `TabSearchHost`;
 *   - the settings module owns option state and supplies a `SettingsSearchHost`;
 *   - the documentation pages own article content and supply a `DocsSearchHost`.
 *
 * The search module never reaches into those modules. It reads through the host interfaces below
 * and calls back through them. Nothing here imports from outside `src/search/`, so this module
 * type-checks and tests on its own even before the other surfaces exist.
 *
 * Rules the hosts must honour:
 *
 *   1. `listTabs()` / `listGroups()` / `listOptions()` / `listArticles()` return the current
 *      snapshot. They are called on every render, so they must be cheap and must not mutate.
 *   2. `subscribe(listener)` calls `listener` after any change that would alter a snapshot, and
 *      returns an unsubscribe function. Search surfaces re-run their query on every call.
 *   3. `revealTab` / `revealOption` reveal a result **without** writing a preference. Revealing a
 *      tab inside a collapsed group expands it for the visit only; the persisted collapsed state
 *      stays as the visitor left it. Hosts that cannot honour that must not implement reveal.
 *   4. `closeTabs` never closes a tab it reports as excluded or failed, and never reports a tab
 *      as closed unless it actually closed. Partial results are reported honestly.
 *   5. Only the *visible* label and title of a tab are searched. Hosts must not place hidden
 *      metadata, page content, or anything sensitive in `label` or `title`.
 *
 * The search module deliberately does not persist queries, patterns, or sample text. It persists
 * only per-field preferences (search mode and regex flags), and `resetSearchPreferences()` clears
 * them. See `preferences.ts`.
 *
 * There are two ways to meet this module, and a surface uses whichever fits:
 *
 *   1. `mountDocsSearch`, `mountSettingsSearch`, `createTabStripSearch`, `createTabGroupSearch`,
 *      `createTabGroupNameSearch`, `createMasterTabSearch` and `createBulkCloseControls` build the
 *      whole surface: field, anchored builder, results list and status line. They read through the
 *      host interfaces below.
 *   2. `attachRegexBuilder(input, options)` in `attachBuilder.ts` adds nothing but the builder to a
 *      field another module already owns and renders. It binds a model to that exact input in both
 *      directions and reports `{ query, mode, caseSensitive, flags, valid, message }` back on every
 *      change, where `mode` is `"plain"` or `"regex"` to match the vocabulary the tab matcher
 *      already uses. Use this for a search box, filter or bulk-close input that is not built here.
 *
 * Either way the rule holds: one builder per field, bound to that field, opened from an affordance
 * beside it.
 */

/** A single tab, as the tabs module presents it to search. */
export interface SearchableTab {
    /** Stable identifier. Passed back to `activateTab`, `revealTab`, and `closeTabs`. */
    readonly id: string;
    /** The visible label. This, and `title`, are the only text a search or bulk close inspects. */
    readonly label: string;
    /** The visible title or tooltip, when it differs from the label. */
    readonly title?: string;
    /** Identifier of the strip that holds this tab. */
    readonly stripId: string;
    /** Visible name of that strip, used verbatim in result rows. */
    readonly stripLabel: string;
    /** Identifier of the window or workspace that holds the strip. */
    readonly windowId: string;
    /** Visible name of that window or workspace, used verbatim in result rows. */
    readonly windowLabel: string;
    /** Group identifier, or `null` when the tab is not grouped. */
    readonly groupId: string | null;
    /** Visible group name, or `null` when the tab is not grouped. */
    readonly groupLabel: string | null;
    /** Whether the tab's group is currently collapsed. */
    readonly groupCollapsed: boolean;
    /** Whether the tab is pinned. Pinned tabs are excluded from bulk close by default. */
    readonly pinned: boolean;
    /** Whether the tab is the active tab of its strip. */
    readonly active: boolean;
    /** Whether the tab holds unsaved work. Such tabs are reported, never closed silently. */
    readonly hasUnsavedWork?: boolean;
}

/** A tab group, as the tabs module presents it to search. */
export interface SearchableTabGroup {
    readonly id: string;
    readonly label: string;
    readonly stripId: string;
    readonly stripLabel: string;
    readonly windowId: string;
    readonly windowLabel: string;
    readonly collapsed: boolean;
    readonly tabCount: number;
}

/** A tab strip, used to scope the current-strip search. */
export interface SearchableTabStrip {
    readonly id: string;
    readonly label: string;
    readonly windowId: string;
    readonly windowLabel: string;
}

/** Why a tab was left out of a bulk close. */
export type TabExclusionReason = "pinned" | "unsaved-work" | "protected" | "not-found";

/** The honest outcome of a bulk close. */
export interface TabCloseReport {
    /** Tabs that actually closed. */
    readonly closed: readonly string[];
    /** Tabs that matched but were deliberately left open, with the reason. */
    readonly excluded: readonly { readonly id: string; readonly reason: TabExclusionReason }[];
    /** Tabs that matched, were attempted, and did not close. */
    readonly failed: readonly { readonly id: string; readonly message: string }[];
}

/** Supplied by the tabs module. */
export interface TabSearchHost {
    listWindows(): readonly { readonly id: string; readonly label: string }[];
    listStrips(): readonly SearchableTabStrip[];
    listGroups(): readonly SearchableTabGroup[];
    listTabs(): readonly SearchableTab[];
    /** The strip the visitor is currently looking at. Scopes the current-strip search. */
    activeStripId(): string;
    /** Focus a tab. Called on result activation. */
    activateTab(id: string): void;
    /**
     * Reveal a result in place. A collapsed group is expanded for this visit only; the persisted
     * collapsed preference is not written.
     */
    revealTab(id: string): void;
    /** Reveal a group row. Same non-persisting rule as `revealTab`. */
    revealGroup(id: string): void;
    /** Close the given tabs. Must report excluded and failed tabs rather than pretending. */
    closeTabs(ids: readonly string[]): Promise<TabCloseReport>;
    subscribe(listener: () => void): () => void;
}

/** One option of a `choice` setting control: a stable id and the label the visitor reads. */
export interface SettingChoiceOption {
    readonly id: string;
    readonly label: string;
}

/**
 * The live control a searchable setting can carry, for a caller that wants to render the real
 * control inline (the command palette) rather than only a link to the screen it lives on.
 *
 * Three kinds, matching the settings this covers: a boolean, a bounded number (a slider or a
 * number setting both render as one box), and a pick from a list. Colour and font settings
 * carry no control here on purpose, because neither can be honestly reproduced as one row; a
 * caller reveals the settings tab for those instead.
 *
 * `set` performs the write and whatever persistence that write needs, so a caller can never
 * half-apply a change by forgetting to save it. It is the same method the settings surface
 * itself writes through, so a value changed here and a value changed there are the same act
 * with the same validation and the same history.
 */
export type SettingControl =
    | {
          readonly kind: "toggle";
          readonly value: boolean;
          readonly set: (value: boolean) => void;
      }
    | {
          readonly kind: "number";
          readonly value: number;
          readonly min: number;
          readonly max: number;
          readonly step: number;
          /** Rendered beside the box, e.g. "px". Empty when the number needs no unit. */
          readonly unit: string;
          readonly set: (value: number) => void;
      }
    | {
          readonly kind: "choice";
          readonly value: string;
          readonly options: readonly SettingChoiceOption[];
          readonly set: (id: string) => void;
      };

/** A single setting, as the settings module presents it to search. */
export interface SearchableSetting {
    readonly id: string;
    /** The visible option label. */
    readonly label: string;
    /** The visible description or helper text. */
    readonly description: string;
    /** The current value rendered as visitor-facing text, for example "Dark" or "150%". */
    readonly valueText: string;
    /** Identifier of the settings tab this option lives on. */
    readonly tabId: string;
    /** Visible name of that tab, used verbatim when reporting an off-tab match. */
    readonly tabLabel: string;
    /** Optional section within the tab. */
    readonly sectionLabel?: string;
    /** Extra searchable synonyms. Never rendered. */
    readonly keywords?: readonly string[];
    /**
     * The real control, when this setting is one a caller can safely write to inline. Absent
     * for settings (colour, font) that need more than one row to edit honestly.
     */
    readonly control?: SettingControl;
}

/** Supplied by the settings module. */
export interface SettingsSearchHost {
    listSettings(): readonly SearchableSetting[];
    /** The settings tab currently on screen, so off-tab matches can say where they are. */
    activeTabId(): string;
    /** Navigate to the option's tab and draw attention to the control. */
    revealSetting(id: string): void;
    subscribe(listener: () => void): () => void;
}

/** A documentation article, as the docs pages present it to search. */
export interface SearchableArticle {
    readonly id: string;
    readonly title: string;
    /** Route or href used to open the article. */
    readonly href: string;
    /** Section or category name shown beside the title. */
    readonly sectionLabel?: string;
    /** Plain text of the article body. Markup must already be stripped by the host. */
    readonly body: string;
}

/** Supplied by the documentation pages. */
export interface DocsSearchHost {
    listArticles(): readonly SearchableArticle[];
    /** Open an article. `matchIndex` is a character offset into `body`, when a body hit was chosen. */
    openArticle(id: string, matchIndex?: number): void;
    subscribe(listener: () => void): () => void;
}
