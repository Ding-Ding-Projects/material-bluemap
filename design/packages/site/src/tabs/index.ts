/**
 * ============================================================================================
 * PUBLIC TAB API
 * ============================================================================================
 *
 * This module is the only thing outside `src/tabs/` should import. `src/content/`,
 * `src/settings/` and `src/search/` all go through `shell.tabs`, which is an instance of
 * `TabsController` defined here.
 *
 * --------------------------------------------------------------------------------------------
 * Registering a page
 * --------------------------------------------------------------------------------------------
 *
 *   shell.tabs.registerPage({
 *       id: "features",                       // stable; persisted state is keyed on it
 *       label: { key: "features.tabLabel" },  // or { text: "Features" } for literal copy
 *       icon: "folder",                        // optional, from src/platform/icons.ts
 *       closable: true,                        // default true; false also blocks bulk closes
 *       pinned: false,                         // first-run default only; a stored pin wins
 *       group: { id: "docs", name: "Docs", colour: "blue" },   // optional, first-run only
 *       render: (host) => {                    // called the first time the page is opened
 *           host.append(somethingReal);
 *           return () => cleanup();            // optional disposer
 *       },
 *   });
 *
 * Registering the same id twice replaces the definition, so a module can override a page the
 * shell seeded (the shell's own Home page is registered as `home` for exactly that reason).
 * Registration order sets the initial strip order; anything the visitor has reordered,
 * pinned, grouped or closed is restored from their stored state and wins over these defaults.
 *
 * --------------------------------------------------------------------------------------------
 * The four discovery searches
 * --------------------------------------------------------------------------------------------
 *
 * Each takes a MatchSpec ({ query, mode: "plain" | "regex", caseSensitive }) and returns
 * results that name where each hit lives. The search module owns the fields, their anchored
 * regex builders and their independent state; this module owns the matching and the data.
 *
 *   1. shell.tabs.searchStrip(spec)          the current strip, including what is in overflow
 *   2. shell.tabs.searchGroup(groupId, spec) one group's pages only
 *   3. shell.tabs.searchGroups(spec)         group names and labels
 *   4. shell.tabs.searchAll(spec)            every page the site owns, closed ones included
 *
 * All four compile through the one matcher in ./matcher.ts, so plain and regex behave the
 * same way in every field, and no field can leak state into another: a MatchSpec is a value,
 * and nothing is cached between calls.
 *
 * `searchStrip` reports `overflowed: true` for a page currently in the overflow menu, and
 * every result carries pinned state, group name, collapsed state, strip id and window label.
 *
 * `shell.tabs.reveal(tabId)` activates a result and moves focus to its tab. If the page is in
 * a collapsed group, the group opens for as long as the visitor stays there and the stored
 * collapsed preference is left alone. If the page was closed, it is reopened.
 *
 * --------------------------------------------------------------------------------------------
 * Bulk close
 * --------------------------------------------------------------------------------------------
 *
 *   shell.tabs.openBulkClose(false, { kind: "all", groupId: null })    // containing text
 *   shell.tabs.openBulkClose(true,  { kind: "all", groupId: null })    // NOT containing text
 *
 * Both directions run one compiled matcher and the inverse negates that same result, so the
 * two partition the same eligible set exactly. `shell.tabs.previewBulkClose(...)` returns the
 * same preview the dialog shows, for a caller that wants the counts without the dialog.
 *
 * --------------------------------------------------------------------------------------------
 * The regex builder slot
 * --------------------------------------------------------------------------------------------
 *
 * `shell.regex.provide(provider)` registers the guided builder. Once provided, the bulk-close
 * dialog and the page list grow a "Build the pattern" button anchored beside their own field.
 * Until then no such button is rendered, because a button that opens nothing is worse than no
 * button. See src/platform/RegexBuilderSlot.ts for the request shape.
 * ============================================================================================
 */

import { STRIP_ID, TabModel, type GroupSearchResult, type TabDefinition, type TabGroup, type TabSearchResult } from "./TabModel.js";
import { TabStrip, type TabStripDeps } from "./TabStrip.js";
import { openBulkCloseDialog, type BulkCloseScope } from "./BulkCloseDialog.js";
import type { BulkClosePreview } from "./TabModel.js";
import type { MatchSpec } from "./matcher.js";

export { TabModel, TabStrip, STRIP_ID };
export type { TabDefinition, TabGroup, TabSearchResult, GroupSearchResult, BulkCloseScope, BulkClosePreview };
export { GROUP_COLOURS } from "./TabModel.js";
export type { GroupColour, Segment } from "./TabModel.js";
export { compileMatcher, MATCH_MODES, MAX_PATTERN_LENGTH, MAX_SUBJECT_LENGTH } from "./matcher.js";
export type { CompiledMatcher, MatchMode, MatchSpec } from "./matcher.js";

/** A strip search result, plus whether the page is currently in the overflow menu. */
export interface StripSearchResult extends TabSearchResult {
    readonly overflowed: boolean;
}

export interface TabSearchOutcome<T> {
    readonly results: readonly T[];
    /** Present when the pattern could not be compiled, with the engine's own message. */
    readonly error: string | null;
    /** True when the matching batch hit its time budget; results are then incomplete. */
    readonly timedOut: boolean;
}

export class TabsController {
    readonly model: TabModel;
    readonly strip: TabStrip;
    private readonly deps: TabStripDeps;

    constructor(deps: TabStripDeps) {
        this.deps = deps;
        this.model = deps.model;
        this.strip = new TabStrip(deps);
    }

    registerPage(definition: TabDefinition): void {
        this.model.register(definition);
    }

    listPages(): TabSearchResult[] {
        return this.model.allIds().map((id) => this.model.describe(id));
    }

    listGroups(): TabGroup[] {
        return this.model.listGroups();
    }

    activate(tabId: string): void {
        this.model.activate(tabId);
    }

    reveal(tabId: string): void {
        this.strip.reveal(tabId);
    }

    /** 1. The current strip and its overflow. */
    searchStrip(spec: MatchSpec): TabSearchOutcome<StripSearchResult> {
        const outcome = this.model.searchTabs(this.model.openIds(), spec);
        const overflowed = new Set(this.strip.overflowedIds());
        return {
            results: outcome.results.map((result) => ({ ...result, overflowed: overflowed.has(result.tabId) })),
            error: outcome.matcher.ok ? null : outcome.matcher.message,
            timedOut: outcome.timedOut,
        };
    }

    /** 2. One group's pages. */
    searchGroup(groupId: string, spec: MatchSpec): TabSearchOutcome<TabSearchResult> {
        const ids = this.model.openIds().filter((id) => this.model.groupOf(id)?.id === groupId);
        const outcome = this.model.searchTabs(ids, spec);
        return {
            results: outcome.results,
            error: outcome.matcher.ok ? null : outcome.matcher.message,
            timedOut: outcome.timedOut,
        };
    }

    /** 3. Group names and labels. */
    searchGroups(spec: MatchSpec): TabSearchOutcome<GroupSearchResult> {
        const outcome = this.model.searchGroupNames(spec);
        return {
            results: outcome.results,
            error: outcome.matcher.ok ? null : outcome.matcher.message,
            timedOut: false,
        };
    }

    /** 4. Every page the site owns, in every strip and group, closed ones included. */
    searchAll(spec: MatchSpec): TabSearchOutcome<TabSearchResult> {
        const outcome = this.model.searchTabs(this.model.allIds(), spec);
        return {
            results: outcome.results,
            error: outcome.matcher.ok ? null : outcome.matcher.message,
            timedOut: outcome.timedOut,
        };
    }

    previewBulkClose(
        spec: MatchSpec,
        options: { readonly invert: boolean; readonly includePinned: boolean },
        scope: BulkCloseScope = { kind: "all", groupId: null },
    ): BulkClosePreview {
        const scopeIds =
            scope.kind === "group" && scope.groupId !== null
                ? this.model.openIds().filter((id) => this.model.groupOf(id)?.id === scope.groupId)
                : undefined;
        return this.model.previewBulkClose(spec, options, scopeIds);
    }

    /** Open either bulk-close direction. `invert` is the only difference between the two. */
    openBulkClose(invert: boolean, scope: BulkCloseScope = { kind: "all", groupId: null }): void {
        openBulkCloseDialog(
            {
                i18n: this.deps.i18n,
                model: this.model,
                notifications: this.deps.notifications,
                regex: this.deps.regex,
            },
            { invert, scope },
        );
    }
}
