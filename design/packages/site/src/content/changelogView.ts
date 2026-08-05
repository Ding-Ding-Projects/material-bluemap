import { createSearchSurface, highlightedText, metaChip } from "../search/searchSurface.js";
import type { SearchSurfaceView } from "../search/searchSurface.js";
import type { CandidateField } from "../search/runSearch.js";
import { el } from "../search/dom.js";
import { changelogEntries, type ChangeEntry } from "./changelog.js";
import type { I18n } from "../i18n/I18n.js";
import { createDateRangePicker } from "./dateRangePicker.js";

type ChangeField = "subject" | "body";

const FIELDS: readonly CandidateField<ChangeEntry, ChangeField>[] = [
    { name: "subject", get: (entry) => entry.subject },
    { name: "body", get: (entry) => `${entry.version} ${entry.date} ${entry.category} ${entry.subject}` },
];

function dateValue(entry: ChangeEntry): number {
    const parsed = Date.parse(entry.date);
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/** Render the complete released history with a bounded date range and searchable entries. */
export function createChangelogView(i18n: I18n): HTMLElement {
    const root = el("section", { class: "mb-changelog" });
    const kicker = el("p", { class: "mb-page-kicker" });
    i18n.bindText(kicker, "site.changelogKicker");
    const title = el("h1", { class: "mb-page-title" });
    i18n.bindText(title, "site.changelogTitle");
    const subtitle = el("p", { class: "mb-page-subtitle" });
    i18n.bindText(subtitle, "site.changelogSubtitle");
    root.append(kicker, title, subtitle);

    const filter = el("div", { class: "mb-changelog-filters", attrs: { role: "group" } });
    i18n.bindAttr(filter, "aria-label", "site.changelogDateFilter");
    const datePicker = createDateRangePicker(i18n);
    filter.append(datePicker.element);
    root.append(filter);

    const listeners = new Set<() => void>();
    const notify = (): void => {
        for (const listener of [...listeners]) listener();
    };
    const unsubscribeDates = datePicker.subscribe(notify);

    const view: SearchSurfaceView<ChangeEntry, ChangeField> = createSearchSurface({
        fieldId: "changelog.entries",
        labelText: i18n.t("site.searchChangelog"),
        placeholder: i18n.t("site.searchChangelogPlaceholder"),
        labelTextSource: () => i18n.t("site.searchChangelog"),
        placeholderSource: () => i18n.t("site.searchChangelogPlaceholder"),
        resultsLabel: i18n.t("site.changelogEntries"),
        fields: FIELDS,
        items: () => {
            const range = datePicker.range();
            const from = range.start === "" ? Number.NEGATIVE_INFINITY : Date.parse(range.start);
            const to = range.end === "" ? Number.POSITIVE_INFINITY : Date.parse(`${range.end}T23:59:59`);
            return changelogEntries.filter((entry) => {
                const value = dateValue(entry);
                return value >= from && value <= to;
            });
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        renderResult: ({ item, hit }) => {
            const row = el("article", { class: "mb-changelog-entry" });
            // "Unreleased" is always the first section CHANGELOG.md carries (see
            // changelogParser.ts's own default), which is exactly the "today" position a
            // timeline's newest marker belongs at -- so this is a stable, filter-independent
            // way to mark it, not an index-based guess that would drift once the visitor
            // searches or narrows the date range.
            if (item.version === "Unreleased") {
                row.classList.add("mb-changelog-entry--unreleased");
                row.append(el("span", { class: "mb-changelog-entry__latest", text: i18n.t("site.changelogLatestLabel") }));
            }
            const heading = el("h2", { class: "mb-changelog-entry__title" });
            heading.append(
                hit?.field === "subject"
                    ? highlightedText(item.subject, hit.span, "mb-changelog-entry__subject")
                    : el("span", { class: "mb-changelog-entry__subject", text: item.subject }),
            );
            row.append(heading);
            const meta = el("div", { class: "mbm-result__meta" });
            meta.append(metaChip(`${item.version}${item.date === "" ? "" : ` · ${item.date}`}`));
            meta.append(metaChip(item.category));
            row.append(meta);
            if (item.commitUrl !== null) {
                const link = el("a", { class: "mb-changelog-entry__commit", text: item.commit ?? i18n.t("site.commitLabel") });
                link.href = item.commitUrl;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.setAttribute("aria-label", i18n.t("site.openCommit", { commit: item.commit ?? i18n.t("site.commitLabel") }));
                row.append(link);
            } else {
                row.append(el("span", { class: "mb-changelog-entry__commit mb-changelog-entry__commit--missing", text: i18n.t("site.commitMissing") }));
            }
            return row;
        },
    });
    root.append(view.element);
    i18n.subscribe(() => view.refresh());

    const actions = el("div", { class: "mb-changelog-actions" });
    const copy = el("button", { class: "md-button md-button--outlined", attrs: { type: "button" } });
    i18n.bindText(copy, "site.copyFiltered");
    const exportButton = el("button", { class: "md-button md-button--outlined", attrs: { type: "button" } });
    i18n.bindText(exportButton, "site.exportMarkdown");
    const status = el("p", { class: "mb-help", attrs: { role: "status", "aria-live": "polite" } });
    const markdown = (): string => view.currentResults().map(({ item }) => `- ${item.subject} (${item.version}${item.commit === null ? "" : `, ${item.commit}`})`).join("\n");
    copy.addEventListener("click", () => {
        const clipboard = navigator.clipboard;
        if (clipboard === undefined) {
            i18n.bindText(status, "site.clipboardUnavailable");
            return;
        }
        void clipboard.writeText(markdown()).then(() => {
            i18n.bindText(status, "site.filteredCopied");
        }).catch(() => {
            i18n.bindText(status, "site.clipboardFailed");
        });
    });
    exportButton.addEventListener("click", () => {
        const blob = new Blob([`# ${i18n.t("site.changelogTitle")}\n\n${markdown()}\n`], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "material-bluemap-changelog.md";
        link.click();
        URL.revokeObjectURL(url);
        i18n.bindText(status, "site.filteredExported");
    });
    actions.append(copy, exportButton, status);
    root.append(actions);
    // The page owns the picker, so destroying the view also removes its anchored panel and
    // listener rather than leaving a stale calendar attached to document.body.
    root.addEventListener("DOMNodeRemoved", () => {
        unsubscribeDates();
        datePicker.destroy();
    }, { once: true });
    return root;
}
