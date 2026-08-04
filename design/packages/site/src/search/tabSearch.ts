/**
 * The four tab searches and both bulk-close actions.
 *
 * The four scopes are separate surfaces with separate fields, separate models and separate
 * builders. Nothing is shared between them, so a pattern typed into the master search cannot
 * appear in a group search, and switching one to regex leaves the others in plain text.
 *
 *   1. the current strip, including whatever has overflowed out of view;
 *   2. one group, created once per group;
 *   3. group names;
 *   4. every open tab in every window, strip and group.
 *
 * Both bulk-close actions run the same matcher and invert the selection rather than deciding
 * separately what a match is, so "containing" and "not containing" always partition the same set.
 * Pinned tabs stay open unless the visitor explicitly includes them, tabs holding unsaved work are
 * reported rather than closed, and nothing closes on an empty query or an invalid pattern.
 */

import type {
    SearchableTab,
    SearchableTabGroup,
    TabCloseReport,
    TabExclusionReason,
    TabSearchHost,
} from "./contract.js";
import { clearChildren, el, localisedLabel, uniqueId } from "./dom.js";
import { sharedRegexEvaluator } from "./evaluator.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import { buildCandidateIndex, resolveHits, runSearch } from "./runSearch.js";
import { createSearchField } from "./searchField.js";
import { createSearchSurface, highlightedText, metaChip } from "./searchSurface.js";
import type { SearchSurfaceView, SurfaceResult } from "./searchSurface.js";
import { label, phrase } from "./strings.js";
import {
    GROUP_FIELDS,
    TAB_FIELDS,
    countExclusions,
    planBulkClose,
    tabsInGroup,
    tabsInStrip,
} from "./tabMatching.js";
import type { GroupField, TabField } from "./tabMatching.js";

export interface TabSearchOptions {
    readonly host: TabSearchHost;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
}

function renderTabResult(
    host: TabSearchHost,
    { item, hit }: SurfaceResult<SearchableTab, TabField>,
): HTMLElement {
    const button = el("button", {
        class: "mbm-result",
        attrs: { type: "button", "aria-label": label("tabActivate", { label: item.label }) },
    });

    button.append(
        hit !== null && hit.field === "label"
            ? highlightedText(item.label, hit.span, "mbm-result__title")
            : el("span", { class: "mbm-result__title", text: item.label }),
    );

    const meta = el("div", { class: "mbm-result__meta" });
    meta.append(
        metaChip(phrase("tabResultLocation", { window: item.windowLabel, strip: item.stripLabel })),
    );
    meta.append(
        metaChip(
            item.groupLabel === null
                ? phrase("tabResultUngrouped")
                : phrase("tabResultGroup", { group: item.groupLabel }),
        ),
    );
    if (item.groupCollapsed) {
        meta.append(metaChip(phrase("tabResultCollapsed")));
    }
    if (item.pinned) {
        meta.append(metaChip(phrase("tabResultPinned")));
    }
    if (item.active) {
        meta.append(metaChip(phrase("tabResultActive")));
    }
    button.append(meta);

    if (hit !== null && hit.field === "title" && item.title !== undefined) {
        button.append(highlightedText(item.title, hit.span, "mbm-result__excerpt"));
    }

    button.addEventListener("click", () => {
        // Revealing expands a collapsed group for this visit only. The stored preference is the
        // host's, and it is not written here.
        host.revealTab(item.id);
        host.activateTab(item.id);
    });

    return button;
}

/** Scope 1: the strip the visitor is looking at, including tabs that have overflowed. */
export function createTabStripSearch(
    options: TabSearchOptions & { readonly stripId?: string },
): SearchSurfaceView<SearchableTab, TabField> {
    const host = options.host;
    const stripId = options.stripId ?? host.activeStripId();

    return createSearchSurface<SearchableTab, TabField>({
        fieldId: `tabs.strip.${stripId}`,
        labelText: label("tabStripFieldLabel"),
        placeholder: phrase("tabStripPlaceholder"),
        resultsLabel: label("tabStripFieldLabel"),
        fields: TAB_FIELDS,
        items: () => tabsInStrip(host.listTabs(), stripId),
        subscribe: (listener) => host.subscribe(listener),
        evaluator: options.evaluator,
        scopeNote: label("tabRevealNote"),
        renderResult: (result) => renderTabResult(host, result),
    });
}

/** Scope 2: one group. Create one of these per group, each with its own field. */
export function createTabGroupSearch(
    options: TabSearchOptions & { readonly groupId: string; readonly groupLabel: string },
): SearchSurfaceView<SearchableTab, TabField> {
    const host = options.host;

    return createSearchSurface<SearchableTab, TabField>({
        fieldId: `tabs.group.${options.groupId}`,
        labelText: label("tabGroupFieldLabel", { group: options.groupLabel }),
        placeholder: phrase("tabGroupPlaceholder"),
        resultsLabel: label("tabGroupFieldLabel", { group: options.groupLabel }),
        fields: TAB_FIELDS,
        items: () => tabsInGroup(host.listTabs(), options.groupId),
        subscribe: (listener) => host.subscribe(listener),
        evaluator: options.evaluator,
        scopeNote: label("tabRevealNote"),
        renderResult: (result) => renderTabResult(host, result),
    });
}

/** Scope 3: group names. */
export function createTabGroupNameSearch(
    options: TabSearchOptions,
): SearchSurfaceView<SearchableTabGroup, GroupField> {
    const host = options.host;

    return createSearchSurface<SearchableTabGroup, GroupField>({
        fieldId: "tabs.groups",
        labelText: label("tabGroupNamesFieldLabel"),
        placeholder: phrase("tabGroupNamesPlaceholder"),
        resultsLabel: label("tabGroupNamesFieldLabel"),
        fields: GROUP_FIELDS,
        items: () => host.listGroups(),
        subscribe: (listener) => host.subscribe(listener),
        evaluator: options.evaluator,
        renderResult: ({ item, hit }) => {
            const button = el("button", {
                class: "mbm-result",
                attrs: { type: "button", "aria-label": label("tabActivate", { label: item.label }) },
            });
            button.append(
                hit !== null
                    ? highlightedText(item.label, hit.span, "mbm-result__title")
                    : el("span", { class: "mbm-result__title", text: item.label }),
            );
            const meta = el("div", { class: "mbm-result__meta" });
            meta.append(
                metaChip(
                    phrase("tabResultLocation", {
                        window: item.windowLabel,
                        strip: item.stripLabel,
                    }),
                ),
            );
            meta.append(metaChip(phrase("tabGroupResultCount", { count: item.tabCount })));
            if (item.collapsed) {
                meta.append(metaChip(phrase("tabGroupResultCollapsed")));
            }
            button.append(meta);
            button.addEventListener("click", () => host.revealGroup(item.id));
            return button;
        },
    });
}

/** Scope 4: every open tab, in every window, strip and group. */
export function createMasterTabSearch(
    options: TabSearchOptions,
): SearchSurfaceView<SearchableTab, TabField> {
    const host = options.host;

    return createSearchSurface<SearchableTab, TabField>({
        fieldId: "tabs.master",
        labelText: label("tabMasterFieldLabel"),
        placeholder: phrase("tabMasterPlaceholder"),
        resultsLabel: label("tabMasterFieldLabel"),
        fields: TAB_FIELDS,
        items: () => host.listTabs(),
        subscribe: (listener) => host.subscribe(listener),
        evaluator: options.evaluator,
        scopeNote: label("tabRevealNote"),
        renderResult: (result) => renderTabResult(host, result),
    });
}

export interface BulkCloseActionOptions extends TabSearchOptions {
    /** `false` closes the tabs that match, `true` closes the tabs that do not. */
    readonly invert: boolean;
    /** Restrict the action to one strip. Omit to act on every tab the host reports. */
    readonly stripId?: string | undefined;
    /** Called with the honest outcome so a host notification system can also show it. */
    readonly onReport?: ((report: TabCloseReport) => void) | undefined;
}

export interface BulkCloseActionView {
    readonly element: HTMLElement;
    destroy(): void;
}

const REASON_KEYS: Record<TabExclusionReason, "bulkReasonPinned" | "bulkReasonUnsaved" | "bulkReasonProtected"> = {
    pinned: "bulkReasonPinned",
    "unsaved-work": "bulkReasonUnsaved",
    protected: "bulkReasonProtected",
    "not-found": "bulkReasonProtected",
};

/**
 * One bulk-close action, with its own field, its own anchored builder, a preview of exactly what
 * it would do, and an explicit include-pinned choice that previews the pinned tabs first.
 */
export function createBulkCloseAction(options: BulkCloseActionOptions): BulkCloseActionView {
    const host = options.host;
    const evaluator = options.evaluator ?? sharedRegexEvaluator();
    const scopeSuffix = options.stripId ?? "all";
    const root = el("div", { class: "mbm-bulk" });

    const previewId = uniqueId("mbm-bulk-preview");
    const preview = el("div", {
        class: "mbm-bulk__preview",
        attrs: { id: previewId, role: "status", "aria-live": "polite" },
    });
    const confirmRegion = el("div", { class: "mbm-bulk__confirm" });
    confirmRegion.hidden = true;

    const runButton = el("button", {
        class: "mbm-button mbm-button--danger",
        attrs: { type: "button", "aria-describedby": previewId },
        children: [localisedLabel(options.invert ? "bulkRunInverse" : "bulkRun")],
    });
    runButton.disabled = true;

    // `createSearchField` synchronises its persisted snapshot immediately and may call
    // `onChange` before it returns. Declare the timer before constructing that field; a
    // field restored with a non-empty query otherwise trips the temporal-dead-zone and
    // makes the entire discovery page fail to boot.
    let sequence = 0;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const includePinnedId = uniqueId("mbm-include-pinned");
    const includePinnedInput = el("input", {
        class: "mbm-check__input",
        attrs: { type: "checkbox", id: includePinnedId },
    });
    const includePinned = el("div", {
        class: "mbm-check",
        children: [
            includePinnedInput,
            el("label", {
                class: "mbm-check__label",
                attrs: { for: includePinnedId },
                children: [localisedLabel("bulkIncludePinned")],
            }),
            el("p", { class: "mbm-hint", text: label("bulkIncludePinnedHint") }),
        ],
    });

    const field = createSearchField({
        fieldId: `tabs.bulk.${options.invert ? "not-containing" : "containing"}.${scopeSuffix}`,
        labelText: label(options.invert ? "bulkNotContainingLabel" : "bulkContainingLabel"),
        placeholder: phrase(
            options.invert ? "bulkNotContainingPlaceholder" : "bulkContainingPlaceholder",
        ),
        evaluator,
        sampleProvider: () =>
            scopedTabs()
                .slice(0, 20)
                .map((tab) => tab.label)
                .join("\n"),
        onChange: () => schedule(),
    });

    root.append(
        field.element,
        el("p", { class: "mbm-hint", text: label("bulkScopeNote") }),
        includePinned,
        preview,
        confirmRegion,
        el("div", { class: "mbm-actions", children: [runButton] }),
    );

    let plannedIds: readonly string[] = [];
    let plannedPinned: readonly SearchableTab[] = [];

    function scopedTabs(): readonly SearchableTab[] {
        const tabs = host.listTabs();
        return options.stripId === undefined ? tabs : tabsInStrip(tabs, options.stripId);
    }

    function schedule(delay = 120): void {
        if (debounce !== null) {
            clearTimeout(debounce);
        }
        debounce = setTimeout(() => {
            debounce = null;
            void updatePreview();
        }, delay);
    }

    function setPreviewText(...lines: readonly string[]): void {
        clearChildren(preview);
        for (const line of lines) {
            preview.append(el("p", { class: "mbm-bulk__line", text: line }));
        }
    }

    function disable(...lines: readonly string[]): void {
        plannedIds = [];
        plannedPinned = [];
        runButton.disabled = true;
        setPreviewText(...lines);
    }

    async function updatePreview(): Promise<void> {
        sequence += 1;
        const token = sequence;
        const query = field.model.effectiveQuery();
        const tabs = scopedTabs();

        if (query.kind === "empty") {
            disable(phrase("bulkPreviewEmptyQuery"));
            return;
        }
        if (query.kind === "invalid") {
            disable(phrase("bulkPreviewInvalid"));
            return;
        }

        const index = buildCandidateIndex(tabs, TAB_FIELDS);
        const outcome = await runSearch(query, index.values, evaluator);
        if (token !== sequence) {
            return;
        }
        if (outcome.status === "invalid") {
            disable(phrase("bulkPreviewInvalid"));
            return;
        }
        if (outcome.status === "timeout") {
            disable(phrase("timedOut", { ms: outcome.limitMs }));
            return;
        }
        if (outcome.status === "limit") {
            disable(phrase("limitExceeded", { message: outcome.message }));
            return;
        }
        if (outcome.status === "unavailable") {
            disable(outcome.message);
            return;
        }
        if (outcome.status === "all") {
            disable(phrase("bulkPreviewEmptyQuery"));
            return;
        }

        const matchedIndices = new Set(
            resolveHits(index, ["label", "title"], outcome.hits).map((hit) => hit.itemIndex),
        );
        const plan = planBulkClose(tabs, matchedIndices, {
            invert: options.invert,
            includePinned: includePinnedInput.checked,
        });

        plannedIds = plan.willClose.map((tab) => tab.id);
        plannedPinned = plan.willClose.filter((tab) => tab.pinned);

        const lines: string[] = [
            query.kind === "regex" ? phrase("bulkModeRegex") : phrase("bulkModePlain"),
        ];
        if (plan.willClose.length === 0) {
            lines.push(phrase("bulkPreviewNone"));
        } else {
            lines.push(phrase("bulkPreviewCount", { count: plan.willClose.length }));
        }
        if (plan.excluded.length > 0) {
            const counts = countExclusions(plan.excluded);
            const reasons: string[] = [];
            for (const reason of Object.keys(counts) as TabExclusionReason[]) {
                const count = counts[reason];
                if (count > 0) {
                    reasons.push(phrase(REASON_KEYS[reason], { count }));
                }
            }
            lines.push(
                phrase("bulkPreviewExcluded", {
                    count: plan.excluded.length,
                    reasons: reasons.join(", "),
                }),
            );
        }

        setPreviewText(...lines);
        const affected = el("ul", { class: "mbm-bulk__list" });
        for (const tab of plan.willClose) {
            affected.append(el("li", { text: tab.label }));
        }
        for (const entry of plan.excluded) {
            affected.append(
                el("li", {
                    class: "mbm-bulk__excluded",
                    text: `${entry.tab.label} (${phrase(REASON_KEYS[entry.reason], { count: 1 })})`,
                }),
            );
        }
        preview.append(affected);
        runButton.disabled = plan.willClose.length === 0;
    }

    async function performClose(): Promise<void> {
        const ids = plannedIds;
        if (ids.length === 0) {
            return;
        }
        runButton.disabled = true;
        const report = await host.closeTabs(ids);
        options.onReport?.(report);

        const lines: string[] = [
            report.closed.length === 0
                ? phrase("bulkResultNoneClosed")
                : phrase("bulkResultClosed", { count: report.closed.length }),
        ];
        if (report.excluded.length > 0) {
            lines.push(phrase("bulkResultExcluded", { count: report.excluded.length }));
        }
        if (report.failed.length > 0) {
            lines.push(
                phrase("bulkResultFailed", {
                    count: report.failed.length,
                    names: report.failed.map((entry) => entry.id).join(", "),
                }),
            );
        }
        setPreviewText(...lines);
        schedule(0);
    }

    function showConfirmation(): void {
        clearChildren(confirmRegion);
        confirmRegion.hidden = false;
        confirmRegion.setAttribute("role", "group");
        confirmRegion.setAttribute("aria-label", label("bulkConfirmHeading"));
        confirmRegion.append(
            el("p", { class: "mbm-bulk__line", text: phrase("bulkConfirmHeading") }),
            el("p", {
                class: "mbm-bulk__line",
                text: phrase("bulkPreviewCount", { count: plannedIds.length }),
            }),
        );
        const list = el("ul", { class: "mbm-bulk__list" });
        for (const tab of plannedPinned) {
            list.append(el("li", { text: `${tab.label} (${phrase("tabResultPinned")})` }));
        }
        confirmRegion.append(list);

        const cancel = el("button", {
            class: "mbm-button",
            attrs: { type: "button" },
            children: [localisedLabel("cancelAction")],
        });
        cancel.addEventListener("click", () => {
            confirmRegion.hidden = true;
            clearChildren(confirmRegion);
            runButton.focus();
        });

        const confirm = el("button", {
            class: "mbm-button mbm-button--danger",
            attrs: { type: "button" },
            children: [localisedLabel(options.invert ? "bulkRunInverse" : "bulkRun")],
        });
        confirm.addEventListener("click", () => {
            confirmRegion.hidden = true;
            clearChildren(confirmRegion);
            void performClose();
        });

        confirmRegion.append(el("div", { class: "mbm-actions", children: [cancel, confirm] }));
        confirm.focus();
    }

    runButton.addEventListener("click", () => {
        if (plannedPinned.length > 0) {
            // Including pinned tabs is a decision, so this one blocks until the visitor makes it.
            showConfirmation();
            return;
        }
        void performClose();
    });

    includePinnedInput.addEventListener("change", () => schedule(0));
    const unsubscribe = host.subscribe(() => schedule(0));
    schedule(0);

    return {
        element: root,
        destroy() {
            if (debounce !== null) {
                clearTimeout(debounce);
            }
            unsubscribe();
            field.destroy();
        },
    };
}

/** Both bulk-close actions, side by side, each with its own field and builder. */
export function createBulkCloseControls(
    options: TabSearchOptions & {
        readonly stripId?: string | undefined;
        readonly onReport?: ((report: TabCloseReport) => void) | undefined;
    },
): BulkCloseActionView {
    const root = el("div", { class: "mbm-bulk-pair" });
    const containing = createBulkCloseAction({ ...options, invert: false });
    const notContaining = createBulkCloseAction({ ...options, invert: true });
    root.append(containing.element, notContaining.element);
    return {
        element: root,
        destroy() {
            containing.destroy();
            notContaining.destroy();
        },
    };
}
