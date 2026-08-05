import { createSearchSurface, highlightedText, metaChip } from "../search/searchSurface.js";
import type { CandidateField } from "../search/runSearch.js";
import type { ResolvedHit } from "../search/runSearch.js";
import type { SearchSurfaceView } from "../search/searchSurface.js";
import { el, uniqueId } from "../search/dom.js";
import type { Preferences } from "../platform/Preferences.js";
import type { I18n } from "../i18n/I18n.js";
import type { SettingControl } from "../search/contract.js";

export interface PaletteCommand {
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly kind: "command" | "page" | "setting" | "appearance";
    readonly run: () => void;
    /**
     * Present only on a "setting" row the caller can write straight through. When set, the row
     * renders this control inline instead of a link to the screen the setting lives on, and
     * writing it does not close the palette: adjusting a value is usually the start of looking
     * at it, not the end.
     */
    readonly control?: SettingControl;
}

/**
 * The live control for one "setting" row, wired straight to `control.set`.
 *
 * A toggle is a real switch, a choice is a real select, and a number (a slider or a bounded
 * number setting both collapse to this) is a real number box that commits on blur or Enter
 * rather than on every keystroke, so typing "1" on the way to "150" never applies a render
 * distance of one block along the way. Every write goes through the same `set` the settings
 * surface itself calls, so a value changed here and a value changed there share one path, one
 * validation and one saved history.
 */
function renderSettingControl(
    item: PaletteCommand,
    control: SettingControl,
    descriptionId: string,
): HTMLElement {
    if (control.kind === "toggle") {
        const input = el("input", {
            class: "md-switch",
            attrs: {
                type: "checkbox",
                role: "switch",
                "aria-label": item.label,
                "aria-describedby": descriptionId,
            },
        });
        input.checked = control.value;
        input.addEventListener("change", () => {
            control.set(input.checked);
        });
        return el("div", { class: "mb-command-palette__control-box", children: [input] });
    }

    if (control.kind === "choice") {
        const select = el("select", {
            class: "md-field__select",
            attrs: { "aria-label": item.label, "aria-describedby": descriptionId },
        });
        for (const option of control.options) {
            select.append(el("option", { text: option.label, attrs: { value: option.id } }));
        }
        select.value = control.value;
        select.addEventListener("change", () => {
            control.set(select.value);
        });
        return el("div", { class: "mb-command-palette__control-box", children: [select] });
    }

    const input = el("input", {
        class: "md-field__input mb-input-number",
        attrs: {
            type: "number",
            min: String(control.min),
            max: String(control.max),
            step: String(control.step),
            inputmode: "decimal",
            autocomplete: "off",
            "aria-label": item.label,
            "aria-describedby": descriptionId,
        },
    });
    input.value = String(control.value);
    const commit = (): void => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
            input.value = String(control.value);
            return;
        }
        const clamped = Math.min(control.max, Math.max(control.min, parsed));
        input.value = String(clamped);
        control.set(clamped);
    };
    input.addEventListener("change", commit);
    const unit =
        control.unit.length === 0
            ? null
            : el("span", {
                  class: "mb-unit",
                  text: control.unit,
                  attrs: { "aria-hidden": "true" },
              });
    return el("div", {
        class: "mb-command-palette__control-box",
        children: unit === null ? [input] : [input, unit],
    });
}

/**
 * A "setting" row that carries its own live control, rendered as a label beside the real
 * control rather than as a single full-row button. Pressing Enter or Space on the control
 * writes the setting; nothing "activates" the row as a whole, because there is nothing left
 * for a row-level action to do once the control itself is reachable.
 */
function renderSettingRow(
    item: PaletteCommand,
    control: SettingControl,
    hit: ResolvedHit<PaletteField> | null,
): HTMLElement {
    const descriptionId = uniqueId("mb-palette-setting-desc");
    const title =
        hit !== null && hit.field === "label"
            ? highlightedText(item.label, hit.span, "mbm-result__title")
            : el("span", { class: "mbm-result__title", text: item.label });
    const description = el("span", {
        class: "mbm-result__excerpt",
        text: item.description,
        attrs: { id: descriptionId },
    });
    const text = el("span", {
        class: "mb-command-palette__setting-text",
        children: [title, description],
    });
    const controlNode = renderSettingControl(item, control, descriptionId);
    return el("div", {
        class: "mbm-result mb-command-palette__result mb-command-palette__setting",
        children: [text, controlNode],
    });
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
    const overlay = el("div", {
        class: "mb-command-palette",
        attrs: { hidden: "", role: "dialog", "aria-modal": "true" },
    });
    options.i18n.bindAttr(overlay, "aria-label", "site.commandPalette");
    const card = el("div", { class: "mb-command-palette__card" });
    const headingTitle = el("h2");
    options.i18n.bindText(headingTitle, "site.commandPalette");
    const heading = el("div", { class: "mb-command-palette__heading", children: [headingTitle] });
    const size = options.prefs.readOneOf(
        "commandPalette.size",
        ["card", "window"] as const,
        "card",
    );
    const toggle = el("button", { class: "md-button md-button--text", attrs: { type: "button" } });
    let currentSize: "card" | "window" = size;
    const refreshToggle = (): void => {
        options.i18n.bindText(
            toggle,
            currentSize === "card" ? "site.useFullWindow" : "site.useBoundedCard",
        );
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
                if (item.kind === "setting" && item.control !== undefined) {
                    // A setting with a live control renders the control itself. Nothing here
                    // closes the palette: writing a value is usually the start of looking at
                    // it, not the end, exactly as the settings page it mirrors behaves.
                    return renderSettingRow(item, item.control, hit);
                }
                const button = el("button", {
                    class: "mbm-result mb-command-palette__result",
                    attrs: { type: "button", "aria-label": `${item.label}: ${item.description}` },
                });
                button.append(
                    hit?.field === "label"
                        ? highlightedText(item.label, hit.span, "mbm-result__title")
                        : el("span", { class: "mbm-result__title", text: item.label }),
                );
                button.append(metaChip(item.kind));
                button.append(el("span", { class: "mbm-result__excerpt", text: item.description }));
                button.addEventListener("click", () => {
                    item.run();
                    close();
                });
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
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
    });
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        }
    });
    return { element: overlay, open, close, isOpen: () => !overlay.hidden };
}
