import { createSearchSurface, highlightedText, metaChip } from "../search/searchSurface.js";
import type { CandidateField } from "../search/runSearch.js";
import type { SearchSurfaceView } from "../search/searchSurface.js";
import { el } from "../search/dom.js";
import type { Preferences } from "../platform/Preferences.js";
import type { I18n } from "../i18n/I18n.js";

export interface PaletteCommand {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly kind: "command" | "page" | "setting" | "appearance";
    readonly run: () => void;
}

type PaletteField = "label" | "body";
const FIELDS: readonly CandidateField<PaletteCommand, PaletteField>[] = [
    { name: "label", get: (item) => item.label },
    { name: "body", get: (item) => `${item.description} ${item.kind}` },
];

export interface CommandPaletteView {
    readonly element: HTMLElement;
    readonly open: () => void;
    readonly close: () => void;
    readonly isOpen: () => boolean;
}

/** A bounded, searchable command surface shared by pages, settings, and appearance actions. */
export function createCommandPalette(options: {
    readonly prefs: Preferences;
    readonly i18n: I18n;
    readonly list: () => readonly PaletteCommand[];
}): CommandPaletteView {
    const overlay = el("div", { class: "mb-command-palette", attrs: { hidden: "", role: "dialog", "aria-modal": "true" } });
    options.i18n.bindAttr(overlay, "aria-label", "site.commandPalette");
    const card = el("div", { class: "mb-command-palette__card" });
    const headingTitle = el("h2");
    options.i18n.bindText(headingTitle, "site.commandPalette");
    const heading = el("div", { class: "mb-command-palette__heading", children: [headingTitle] });
    const size = options.prefs.readOneOf("commandPalette.size", ["card", "window"] as const, "card");
    const toggle = el("button", { class: "md-button md-button--text", attrs: { type: "button" } });
    let currentSize: "card" | "window" = size;
    const refreshToggle = (): void => {
        options.i18n.bindText(toggle, currentSize === "card" ? "site.useFullWindow" : "site.useBoundedCard");
    };
    refreshToggle();
    toggle.addEventListener("click", () => {
        currentSize = currentSize === "card" ? "window" : "card";
        options.prefs.write("commandPalette.size", currentSize);
        overlay.dataset.size = currentSize;
        refreshToggle();
    });
    heading.append(toggle);
    card.append(heading);

    let surface: SearchSurfaceView<PaletteCommand, PaletteField> | null = null;
    const host = el("div", { class: "mb-command-palette__surface" });
    const renderSurface = (): void => {
        surface?.destroy();
        host.replaceChildren();
        surface = createSearchSurface({
            fieldId: "command-palette",
            labelText: options.i18n.t("site.paletteSearchLabel"),
            placeholder: options.i18n.t("site.paletteSearchPlaceholder"),
            resultsLabel: options.i18n.t("site.paletteResults"),
            fields: FIELDS,
            items: options.list,
            renderResult: ({ item, hit }) => {
                const button = el("button", { class: "mbm-result mb-command-palette__result", attrs: { type: "button", "aria-label": `${item.label}: ${item.description}` } });
                button.append(hit?.field === "label" ? highlightedText(item.label, hit.span, "mbm-result__title") : el("span", { class: "mbm-result__title", text: item.label }));
                button.append(metaChip(item.kind));
                button.append(el("span", { class: "mbm-result__excerpt", text: item.description }));
                button.addEventListener("click", () => { item.run(); close(); });
                return button;
            },
        });
        host.append(surface.element);
    };
    card.append(host);
    overlay.append(card);
    overlay.dataset.size = currentSize;

    const close = (): void => {
        overlay.hidden = true;
        surface?.field.focus();
    };
    const open = (): void => {
        overlay.hidden = false;
        renderSurface();
        window.setTimeout(() => surface?.field.focus(), 0);
    };
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") { event.preventDefault(); close(); } });
    return { element: overlay, open, close, isOpen: () => !overlay.hidden };
}
