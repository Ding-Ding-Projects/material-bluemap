import { createSearchSurface, highlightedText, metaChip } from "../search/searchSurface.js";
import type { SearchSurfaceView } from "../search/searchSurface.js";
import type { CandidateField } from "../search/runSearch.js";
import { el } from "../search/dom.js";
import { changelogEntries, type ChangeEntry } from "./changelog.js";

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
export function createChangelogView(): HTMLElement {
    const root = el("section", { class: "mb-changelog" });
    root.append(
        el("h1", { class: "mb-page-title", text: "Changelog" }),
        el("p", {
            class: "mb-page-subtitle",
            text: "Every recorded version, date, category, and the commit that made it real.",
        }),
    );

    const filter = el("div", { class: "mb-changelog-filters", attrs: { role: "group", "aria-label": "Changelog date filter" } });
    const start = el("input", { class: "md-field__input", attrs: { type: "date", "aria-label": "Start date" } });
    const end = el("input", { class: "md-field__input", attrs: { type: "date", "aria-label": "End date" } });
    const preset = (label: string, days: number | null): HTMLButtonElement => {
        const button = el("button", { class: "md-button md-button--outlined", text: label, attrs: { type: "button" } });
        button.addEventListener("click", () => {
            if (days === null) {
                start.value = "";
                end.value = "";
            } else {
                const now = new Date();
                const from = new Date(now.getTime() - days * 86_400_000);
                start.value = from.toISOString().slice(0, 10);
                end.value = now.toISOString().slice(0, 10);
            }
            notify();
        });
        return button;
    };
    filter.append(
        el("label", { class: "mb-changelog-date", children: [el("span", { text: "From" }), start] }),
        el("label", { class: "mb-changelog-date", children: [el("span", { text: "To" }), end] }),
        preset("All dates", null),
        preset("Last 30 days", 30),
        preset("Last 90 days", 90),
    );
    root.append(filter);

    const listeners = new Set<() => void>();
    const notify = (): void => {
        for (const listener of [...listeners]) listener();
    };
    start.addEventListener("change", notify);
    end.addEventListener("change", notify);

    const view: SearchSurfaceView<ChangeEntry, ChangeField> = createSearchSurface({
        fieldId: "changelog.entries",
        labelText: "Search changelog",
        placeholder: "Search versions, changes, or commits",
        resultsLabel: "Changelog entries",
        fields: FIELDS,
        items: () => {
            const from = start.value === "" ? Number.NEGATIVE_INFINITY : Date.parse(start.value);
            const to = end.value === "" ? Number.POSITIVE_INFINITY : Date.parse(`${end.value}T23:59:59`);
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
                const link = el("a", { class: "mb-changelog-entry__commit", text: item.commit ?? "commit" });
                link.href = item.commitUrl;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.setAttribute("aria-label", `Open commit ${item.commit ?? ""}`);
                row.append(link);
            } else {
                row.append(el("span", { class: "mb-changelog-entry__commit mb-changelog-entry__commit--missing", text: "Commit not recorded" }));
            }
            return row;
        },
    });
    root.append(view.element);

    const actions = el("div", { class: "mb-changelog-actions" });
    const copy = el("button", { class: "md-button md-button--outlined", text: "Copy filtered changelog", attrs: { type: "button" } });
    const exportButton = el("button", { class: "md-button md-button--outlined", text: "Export Markdown", attrs: { type: "button" } });
    const status = el("p", { class: "mb-help", attrs: { role: "status", "aria-live": "polite" } });
    const markdown = (): string => view.currentResults().map(({ item }) => `- ${item.subject} (${item.version}${item.commit === null ? "" : `, ${item.commit}`})`).join("\n");
    copy.addEventListener("click", () => {
        const clipboard = navigator.clipboard;
        if (clipboard === undefined) {
            status.textContent = "Clipboard access is unavailable; use Export Markdown instead.";
            return;
        }
        void clipboard.writeText(markdown()).then(() => {
            status.textContent = "Filtered changelog copied.";
        }).catch(() => {
            status.textContent = "Clipboard access failed; use Export Markdown instead.";
        });
    });
    exportButton.addEventListener("click", () => {
        const blob = new Blob([`# Changelog export\n\n${markdown()}\n`], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "material-bluemap-changelog.md";
        link.click();
        URL.revokeObjectURL(url);
        status.textContent = "Filtered changelog exported.";
    });
    actions.append(copy, exportButton, status);
    root.append(actions);
    return root;
}
