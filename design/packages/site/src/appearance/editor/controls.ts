/**
 * The controls every appearance editor is built from.
 *
 * Each returns a row with a label, the control, a per-property reset, and a place
 * for a capability note. Building them from one factory is what keeps a colour in
 * the typography section and a colour in the box section behaving identically, and
 * what makes "every property resets on its own" true by construction rather than
 * by remembering to add a button each time.
 */

import { clear, el, uniqueId } from "../../platform/dom.js";
import { announce } from "../../settings/dom.js";
import { fillPhrase, t } from "../../settings/i18n.js";
import { AnchoredPanel } from "../../search/anchoredPanel.js";
import { attachRegexBuilder } from "../../search/attachBuilder.js";
import { compileMatcher } from "../../tabs/matcher.js";
import type { Preferences } from "../../platform/Preferences.js";
import { createColorPicker } from "../color/picker.js";
import { parseColor } from "../color/representations.js";
import { toRenderableCss } from "../color/value.js";
import type { FontFamilyEntry } from "../type/fonts.js";
import { findFamily, isFamilyAvailable } from "../type/fonts.js";

export interface ControlRow {
    readonly element: HTMLElement;
    /** Re-read the value from the store and update the control and its reset button. */
    refresh(): void;
}

export interface RowOptions {
    readonly labelKey: string;
    readonly descriptionKey?: string | undefined;
    /** i18n key for a note explaining that the browser will not render this property. */
    readonly capabilityNoteKey?: string | null | undefined;
    readonly onReset: () => void;
    readonly isDefault: () => boolean;
}

function buildRow(
    options: RowOptions,
    control: HTMLElement,
    controlId: string
): { row: HTMLElement; refreshReset: () => void } {
    const label = el("label", { class: "md-field__label", attrs: { for: controlId } });
    fillPhrase(label, options.labelKey);

    const reset = el("button", {
        class: "md-icon-button mb-reset",
        text: "Reset",
        attrs: {
            type: "button",
            "aria-label": t("editor.resetProperty", { name: t(options.labelKey) }),
        },
    });
    reset.addEventListener("click", () => {
        options.onReset();
        announce(t("editor.resetProperty", { name: t(options.labelKey) }));
    });

    const head = el("div", { class: "mb-row-head" }, label, reset);
    const row = el("div", { class: "mb-property-row" }, head, control);

    if (options.descriptionKey !== undefined && options.descriptionKey !== null) {
        const description = el("p", { class: "md-field__help mb-help" });
        fillPhrase(description, options.descriptionKey);
        row.append(description);
    }
    if (options.capabilityNoteKey !== undefined && options.capabilityNoteKey !== null) {
        const note = el("p", { class: "mb-capability-note", attrs: { role: "note" } });
        fillPhrase(note, options.capabilityNoteKey);
        row.append(note);
        row.dataset["unsupported"] = "true";
    }

    const refreshReset = (): void => {
        const atDefault = options.isDefault();
        reset.disabled = atDefault;
        reset.title = atDefault ? t("settings.atDefault") : t("editor.resetProperty", { name: t(options.labelKey) });
    };
    refreshReset();
    return { row, refreshReset };
}

/* ------------------------------------------------------------------ *
 * Toggle
 * ------------------------------------------------------------------ */

export function toggleRow(
    options: RowOptions & { read: () => boolean; write: (value: boolean) => void }
): ControlRow {
    const id = uniqueId("mb-toggle");
    const input = el("input", { class: "md-switch", attrs: { id, type: "checkbox", role: "switch" } });
    input.addEventListener("change", () => {
        options.write(input.checked);
    });
    const { row, refreshReset } = buildRow(options, el("div", { class: "mb-control" }, input), id);
    const refresh = (): void => {
        input.checked = options.read();
        input.setAttribute("aria-checked", input.checked ? "true" : "false");
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Select
 * ------------------------------------------------------------------ */

export interface SelectChoiceView {
    readonly value: string;
    readonly labelKey: string;
}

export function selectRow(
    options: RowOptions & {
        choices: readonly SelectChoiceView[];
        read: () => string;
        write: (value: string) => void;
    }
): ControlRow {
    const id = uniqueId("md-field__select");
    const select = el("select", { class: "md-field__select", attrs: { id } });
    for (const choice of options.choices) {
        select.append(el("option", { text: t(choice.labelKey), attrs: { value: choice.value } }));
    }
    select.addEventListener("change", () => {
        options.write(select.value);
    });
    const { row, refreshReset } = buildRow(options, el("div", { class: "mb-control" }, select), id);
    const refresh = (): void => {
        const current = options.read();
        clear(select);
        for (const choice of options.choices) {
            select.append(el("option", { text: t(choice.labelKey), attrs: { value: choice.value } }));
        }
        select.value = current;
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Number, with a stepper and free entry
 * ------------------------------------------------------------------ */

export function numberRow(
    options: RowOptions & {
        min: number;
        max: number;
        step: number;
        unit?: string | undefined;
        read: () => number;
        write: (value: number) => void;
    }
): ControlRow {
    const id = uniqueId("mb-number");
    const input = el("input", {
        class: "md-field__input mb-input-number",
        attrs: {
            id,
            type: "number",
            min: String(options.min),
            max: String(options.max),
            step: String(options.step),
            inputmode: "decimal",
            autocomplete: "off",
        },
    });
    const commit = (): void => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) {
            input.value = String(options.read());
            return;
        }
        options.write(Math.min(options.max, Math.max(options.min, parsed)));
    };
    input.addEventListener("change", commit);

    const down = stepButton("-", () => {
        options.write(Math.max(options.min, round(options.read() - options.step)));
    });
    const up = stepButton("+", () => {
        options.write(Math.min(options.max, round(options.read() + options.step)));
    });
    down.setAttribute("aria-label", `${t(options.labelKey)} -${options.step}`);
    up.setAttribute("aria-label", `${t(options.labelKey)} +${options.step}`);

    const unit =
        options.unit === undefined || options.unit === ""
            ? null
            : el("span", { class: "mb-unit", text: options.unit, attrs: { "aria-hidden": "true" } });

    const control = el("div", { class: "mb-control mb-stepper" }, down, input, unit, up);
    const { row, refreshReset } = buildRow(options, control, id);
    const refresh = (): void => {
        if (document.activeElement !== input) input.value = String(options.read());
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

function round(value: number): number {
    return Number(value.toFixed(6));
}

function stepButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = el("button", { class: "md-icon-button", text: label, attrs: { type: "button" } });
    button.addEventListener("click", onClick);
    return button;
}

/* ------------------------------------------------------------------ *
 * Slider
 * ------------------------------------------------------------------ */

export function sliderRow(
    options: RowOptions & {
        min: number;
        max: number;
        step: number;
        read: () => number;
        write: (value: number) => void;
        /** Screen-reader text for the current stop, when the number alone means little. */
        valueText?: ((value: number) => string) | undefined;
    }
): ControlRow {
    const id = uniqueId("mb-slider");
    const input = el("input", {
        class: "md-slider mb-range",
        attrs: {
            id,
            type: "range",
            min: String(options.min),
            max: String(options.max),
            step: String(options.step),
        },
    });
    const readout = el("output", { class: "mb-range-readout", attrs: { for: id } });
    input.addEventListener("input", () => {
        options.write(Number(input.value));
    });
    const control = el("div", { class: "mb-control mb-slider" }, input, readout);
    const { row, refreshReset } = buildRow(options, control, id);
    const refresh = (): void => {
        const value = options.read();
        input.value = String(value);
        const text = options.valueText?.(value) ?? String(value);
        readout.textContent = text;
        input.setAttribute("aria-valuetext", text);
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Free text
 * ------------------------------------------------------------------ */

export function textRow(
    options: RowOptions & {
        maxLength: number;
        placeholder?: string | undefined;
        read: () => string;
        write: (value: string) => void;
    }
): ControlRow {
    const id = uniqueId("mb-text");
    const input = el("input", {
        class: "md-field__input",
        attrs: {
            id,
            type: "text",
            maxlength: String(options.maxLength),
            autocomplete: "off",
            spellcheck: "false",
            ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
        },
    });
    input.addEventListener("change", () => {
        options.write(input.value);
    });
    const { row, refreshReset } = buildRow(options, el("div", { class: "mb-control" }, input), id);
    const refresh = (): void => {
        if (document.activeElement !== input) input.value = options.read();
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Colour
 * ------------------------------------------------------------------ */

export interface ColorRowExtras {
    readonly prefs?: Preferences | undefined;
    /** Surface the colour will sit on, for the contrast readout inside the picker. */
    readonly contrastAgainst?: string | undefined;
    readonly contrastAgainstName?: string | undefined;
    /** Show a Clear button that returns the value to the inherit sentinel. */
    readonly allowInherit?: boolean | undefined;
}

export function colorRow(
    options: RowOptions &
        ColorRowExtras & {
            read: () => string;
            write: (value: string) => void;
        }
): ControlRow {
    const id = uniqueId("mb-color");
    const swatch = el("span", { class: "mb-swatch-preview", attrs: { "aria-hidden": "true" } });
    const trigger = el("button", {
        class: "mb-color-trigger",
        attrs: { id, type: "button" },
    });
    const triggerText = el("span", { class: "mb-color-trigger-text" });
    trigger.append(swatch, triggerText);

    const textInput = el("input", {
        class: "md-field__input mb-input-mono",
        attrs: {
            type: "text",
            autocomplete: "off",
            spellcheck: "false",
            "aria-label": `${t(options.labelKey)} ${t("color.title")}`,
        },
    });
    textInput.addEventListener("change", () => {
        const parsed = parseColor(textInput.value);
        if (parsed.value === null && textInput.value.trim() !== "") {
            textInput.setAttribute("aria-invalid", "true");
            return;
        }
        textInput.removeAttribute("aria-invalid");
        options.write(textInput.value.trim());
    });

    const controlChildren: (HTMLElement | null)[] = [trigger, textInput];
    if (options.allowInherit === true) {
        const clearButton = el("button", {
            class: "md-icon-button",
            text: t("color.clear"),
            attrs: { type: "button", "aria-label": `${t("color.inherit")}: ${t(options.labelKey)}` },
        });
        clearButton.addEventListener("click", () => {
            options.write("");
        });
        controlChildren.push(clearButton);
    }

    const control = el("div", { class: "mb-control mb-color-control" }, ...controlChildren);
    const { row, refreshReset } = buildRow(options, control, id);

    const panel = new AnchoredPanel({
        anchor: trigger,
        returnFocusTo: trigger,
        title: t("color.open"),
    });
    trigger.addEventListener("click", () => {
        if (panel.isOpen) {
            panel.close();
            return;
        }
        const picker = createColorPicker({
            initial: options.read() === "" ? "#808080" : options.read(),
            onChange: (value) => {
                options.write(value);
            },
            contrastAgainst: options.contrastAgainst,
            contrastAgainstName: options.contrastAgainstName,
            prefs: options.prefs,
        });
        panel.show(picker.element);
    });

    const refresh = (): void => {
        const value = options.read();
        if (document.activeElement !== textInput) textInput.value = value;
        const parsed = value === "" ? null : parseColor(value).value;
        swatch.style.setProperty(
            "--mb-swatch-color",
            parsed === null ? "transparent" : toRenderableCss(parsed)
        );
        swatch.dataset["empty"] = parsed === null ? "true" : "false";
        triggerText.textContent = value === "" ? t("color.inherit") : value;
        trigger.setAttribute(
            "aria-label",
            `${t("color.open")}: ${t(options.labelKey)}, ${value === "" ? t("color.inherit") : value}`
        );
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}

/* ------------------------------------------------------------------ *
 * Font family
 * ------------------------------------------------------------------ */

export interface FontRowExtras {
    readonly families: () => readonly FontFamilyEntry[];
    /** Ask the browser for the installed families. Returns the note key to show. */
    readonly requestInstalled: () => Promise<string>;
    readonly installedNoteKey: () => string;
}

export function fontRow(
    options: RowOptions &
        FontRowExtras & {
            read: () => string;
            write: (value: string) => void;
            /** Offer an explicit inherit choice. */
            allowInherit?: boolean | undefined;
        }
): ControlRow {
    const id = uniqueId("mb-font");
    const trigger = el("button", { class: "mb-font-trigger", attrs: { id, type: "button" } });
    const control = el("div", { class: "mb-control" }, trigger);
    const { row, refreshReset } = buildRow(options, control, id);

    let closeFontList = (): void => {
        // Replaced below once a font list has actually been built; a close before then has
        // nothing to tear down.
    };
    const panel = new AnchoredPanel({
        anchor: trigger,
        returnFocusTo: trigger,
        title: t("type.family"),
        onClose: () => closeFontList(),
    });

    trigger.addEventListener("click", () => {
        if (panel.isOpen) {
            panel.close();
            return;
        }
        const list = buildFontList();
        closeFontList = list.destroy;
        panel.show(list.element);
    });

    function buildFontList(): { element: HTMLElement; destroy: () => void } {
        const container = el("div", { class: "mb-font-list" });
        const searchId = uniqueId("mb-font-search");
        const search = el("input", {
            class: "md-field__input",
            attrs: {
                id: searchId,
                type: "search",
                autocomplete: "off",
                "aria-label": t("type.familySearch"),
                placeholder: t("type.familySearch"),
            },
        });
        // Same row-plus-anchored-builder shape as every other search field in this
        // application: plain substring by default, the guided pattern builder beside it.
        // Reuses the menu search row's own layout rule -- flex, gapped, input growing to
        // fill -- since the shape is identical and a second copy of the same three lines
        // of CSS would only be one more place for the two to drift apart.
        const searchRow = el("div", { class: "md-menu__search-row" }, search);
        let filterMode: "plain" | "regex" = "plain";
        let filterCaseSensitive = false;
        const note = el("p", { class: "md-field__help mb-help", text: t(options.installedNoteKey()) });
        const listbox = el("div", {
            class: "mb-font-options",
            attrs: { role: "listbox", "aria-label": t("type.family") },
        });

        const request = el("button", {
            class: "md-button md-button--tonal",
            text: t("type.fontsQuery"),
            attrs: { type: "button" },
        });
        request.addEventListener("click", () => {
            void options.requestInstalled().then((noteKey) => {
                note.textContent = t(noteKey);
                renderOptions(search.value);
            });
        });

        function renderOptions(query: string): void {
            clear(listbox);
            const current = options.read();
            const matcher =
                query.trim().length === 0
                    ? null
                    : compileMatcher({ query, mode: filterMode, caseSensitive: filterCaseSensitive });
            const keep = (name: string): boolean => matcher === null || (matcher.ok && matcher.test(name));

            if (options.allowInherit === true && keep(t("type.inherit"))) {
                listbox.append(fontOption("", t("type.inherit"), "inherit", current === ""));
            }
            for (const family of options.families()) {
                if (!keep(family.name)) continue;
                listbox.append(
                    fontOption(family.id, family.name, family.stack, current === family.id)
                );
            }
            if (listbox.childElementCount === 0) {
                listbox.append(el("p", { class: "md-field__help mb-help", text: t("menu.noItems") }));
            }
        }

        function fontOption(
            value: string,
            name: string,
            stack: string,
            selected: boolean
        ): HTMLElement {
            const option = el("button", {
                class: "mb-font-option",
                attrs: {
                    type: "button",
                    role: "option",
                    "aria-selected": selected ? "true" : "false",
                },
            });
            const sample = el("span", { class: "mb-font-name", text: name });
            if (stack !== "inherit") sample.style.fontFamily = stack;
            option.append(sample);
            // A family the machine does not have still appears, marked. Hiding it would
            // drop a value a visitor deliberately chose for another machine.
            const primary = stack.split(",")[0]?.replace(/["']/g, "").trim() ?? "";
            if (stack !== "inherit" && primary !== "" && !isFamilyAvailable(primary)) {
                option.append(el("span", { class: "mb-font-missing", text: t("type.fontMissing") }));
            }
            option.addEventListener("click", () => {
                options.write(value);
                panel.close();
            });
            return option;
        }

        const builder = attachRegexBuilder(search, {
            fieldId: searchId,
            fieldLabel: t("type.familySearch"),
            container: searchRow,
            persist: false,
            sampleProvider: () => options.families().map((family) => family.name).join("\n"),
            onChange: (spec) => {
                filterMode = spec.mode;
                filterCaseSensitive = spec.caseSensitive;
                renderOptions(spec.query);
            },
        });
        renderOptions("");
        container.append(searchRow, note, request, listbox);
        return { element: container, destroy: () => builder.destroy() };
    }

    const refresh = (): void => {
        const value = options.read();
        const family = value === "" ? undefined : findFamily(options.families(), value);
        const name = family?.name ?? (value === "" ? t("type.inherit") : value);
        trigger.textContent = name;
        if (family !== undefined) trigger.style.fontFamily = family.stack;
        else trigger.style.removeProperty("font-family");
        trigger.setAttribute("aria-label", `${t("type.family")}: ${name}`);
        refreshReset();
    };
    refresh();
    return { element: row, refresh };
}
