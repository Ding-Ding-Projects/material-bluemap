import { AnchoredPanel } from "../search/anchoredPanel.js";
import { el } from "../search/dom.js";
import type { I18n } from "../i18n/I18n.js";

export interface DateRange {
    readonly start: string;
    readonly end: string;
}

export interface DateRangePickerView {
    readonly element: HTMLElement;
    readonly range: () => DateRange;
    readonly subscribe: (listener: () => void) => () => void;
    readonly destroy: () => void;
}

/**
 * A bounded, keyboard-operable date range control for the changelog.
 *
 * The text fields accept ISO (YYYY-MM-DD) and the visitor's common slash form. The calendar
 * stays anchored to the button, supports month navigation and range selection, and never hides
 * the typed value when validation fails.
 */
export function createDateRangePicker(i18n: I18n): DateRangePickerView {
    const root = el("div", { class: "mb-date-range" });
    const button = el("button", { class: "md-button md-button--outlined", attrs: { type: "button" } });
    i18n.bindText(button, "site.dateRangeButton");
    root.append(button);

    let start = "";
    let end = "";
    let focusMonth = new Date();
    focusMonth = new Date(focusMonth.getFullYear(), focusMonth.getMonth(), 1);
    const listeners = new Set<() => void>();

    const panel = new AnchoredPanel({
        anchor: button,
        returnFocusTo: button,
        title: i18n.t("site.datePickerTitle"),
    });

    const panelBody = el("div", { class: "mb-date-range__panel" });
    const heading = el("h2", { class: "mb-date-range__title" });
    i18n.bindText(heading, "site.datePickerTitle");
    const startInput = el("input", {
        class: "md-field__input",
        attrs: { type: "text", inputmode: "numeric", placeholder: "YYYY-MM-DD", autocomplete: "off" },
    });
    const endInput = el("input", {
        class: "md-field__input",
        attrs: { type: "text", inputmode: "numeric", placeholder: "YYYY-MM-DD", autocomplete: "off" },
    });
    i18n.bindAttr(startInput, "aria-label", "site.selectStart");
    i18n.bindAttr(endInput, "aria-label", "site.selectEnd");
    const error = el("p", { class: "mb-help mb-date-range__error", attrs: { role: "alert", hidden: "" } });
    i18n.bindText(error, "site.dateInvalid");

    const monthInput = el("input", { class: "md-field__input", attrs: { type: "month" } });
    i18n.bindAttr(monthInput, "aria-label", "site.datePickerTitle");
    const previous = el("button", { class: "md-icon-button", attrs: { type: "button" } });
    const next = el("button", { class: "md-icon-button", attrs: { type: "button" } });
    i18n.bindAttr(previous, "aria-label", "site.previousMonth");
    i18n.bindAttr(next, "aria-label", "site.nextMonth");
    previous.textContent = "‹";
    next.textContent = "›";
    const calendar = el("div", { class: "mb-date-range__calendar", attrs: { role: "grid", "aria-label": i18n.t("site.datePickerTitle") } });
    const apply = el("button", { class: "md-button md-button--filled", attrs: { type: "button" } });
    const reset = el("button", { class: "md-button md-button--text", attrs: { type: "button" } });
    i18n.bindText(apply, "site.applyRange");
    i18n.bindText(reset, "site.resetRange");
    const preset = (key: "site.allDates" | "site.last30" | "site.last90", days: number | null): HTMLButtonElement => {
        const presetButton = el("button", { class: "md-button md-button--outlined", attrs: { type: "button" } });
        i18n.bindText(presetButton, key);
        presetButton.addEventListener("click", () => {
            if (days === null) {
                start = "";
                end = "";
            } else {
                const now = new Date();
                const from = new Date(now.getTime() - days * 86_400_000);
                start = formatDate(from);
                end = formatDate(now);
            }
            startInput.value = start;
            endInput.value = end;
            setError(false);
            renderCalendar();
            notify();
        });
        return presetButton;
    };

    const setError = (visible: boolean): void => {
        error.hidden = !visible;
        startInput.setAttribute("aria-invalid", visible ? "true" : "false");
        endInput.setAttribute("aria-invalid", visible ? "true" : "false");
    };

    const updateMonth = (): void => {
        monthInput.value = monthValue(focusMonth);
        renderCalendar();
    };

    const onInput = (): void => {
        const parsedStart = parseDate(startInput.value);
        const parsedEnd = parseDate(endInput.value);
        setError((startInput.value.trim() !== "" && parsedStart === null) || (endInput.value.trim() !== "" && parsedEnd === null));
        if (parsedStart !== null) start = formatDate(parsedStart);
        if (parsedEnd !== null) end = formatDate(parsedEnd);
        renderCalendar();
    };
    startInput.addEventListener("input", onInput);
    endInput.addEventListener("input", onInput);
    monthInput.addEventListener("change", () => {
        const parsed = parseMonth(monthInput.value);
        if (parsed !== null) {
            focusMonth = parsed;
            renderCalendar();
        }
    });
    previous.addEventListener("click", () => { focusMonth = new Date(focusMonth.getFullYear(), focusMonth.getMonth() - 1, 1); updateMonth(); });
    next.addEventListener("click", () => { focusMonth = new Date(focusMonth.getFullYear(), focusMonth.getMonth() + 1, 1); updateMonth(); });
    apply.addEventListener("click", () => {
        const parsedStart = parseDate(startInput.value);
        const parsedEnd = parseDate(endInput.value);
        const invalid = (startInput.value.trim() !== "" && parsedStart === null) || (endInput.value.trim() !== "" && parsedEnd === null);
        if (invalid || (parsedStart !== null && parsedEnd !== null && parsedStart > parsedEnd)) {
            setError(true);
            return;
        }
        start = parsedStart === null ? "" : formatDate(parsedStart);
        end = parsedEnd === null ? "" : formatDate(parsedEnd);
        notify();
        panel.close();
    });
    reset.addEventListener("click", () => {
        start = "";
        end = "";
        startInput.value = "";
        endInput.value = "";
        setError(false);
        renderCalendar();
        notify();
    });

    const fromLabel = el("span");
    const toLabel = el("span");
    i18n.bindText(fromLabel, "site.from");
    i18n.bindText(toLabel, "site.to");
    panelBody.append(
        heading,
        el("div", { class: "mb-date-range__inputs", children: [
            el("label", { class: "mb-changelog-date", children: [fromLabel, startInput] }),
            el("label", { class: "mb-changelog-date", children: [toLabel, endInput] }),
        ] }),
        error,
        el("div", { class: "mb-date-range__presets", children: [preset("site.allDates", null), preset("site.last30", 30), preset("site.last90", 90)] }),
        el("div", { class: "mb-date-range__month", children: [previous, monthInput, next] }),
        calendar,
        el("div", { class: "mb-date-range__actions", children: [reset, apply] }),
    );

    button.addEventListener("click", () => {
        startInput.value = start;
        endInput.value = end;
        updateMonth();
        if (panel.isOpen) panel.close(); else panel.show(panelBody);
    });

    function renderCalendar(): void {
        calendar.replaceChildren();
        const first = new Date(focusMonth.getFullYear(), focusMonth.getMonth(), 1);
        const offset = first.getDay();
        for (let index = 0; index < 42; index += 1) {
            const day = new Date(focusMonth.getFullYear(), focusMonth.getMonth(), index - offset + 1);
            const value = formatDate(day);
            const dayButton = el("button", { class: "mb-date-range__day", text: String(day.getDate()), attrs: { type: "button", role: "gridcell", "aria-label": value } });
            dayButton.classList.toggle("is-outside", day.getMonth() !== focusMonth.getMonth());
            dayButton.classList.toggle("is-selected", value === start || value === end);
            dayButton.classList.toggle("is-in-range", start !== "" && end !== "" && value > start && value < end);
            dayButton.addEventListener("click", () => {
                if (start === "" || (start !== "" && end !== "")) {
                    start = value;
                    end = "";
                } else if (value < start) {
                    end = start;
                    start = value;
                } else {
                    end = value;
                }
                startInput.value = start;
                endInput.value = end;
                setError(false);
                renderCalendar();
            });
            calendar.append(dayButton);
        }
    }

    function notify(): void { for (const listener of [...listeners]) listener(); }

    return {
        element: root,
        range: () => ({ start, end }),
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        destroy() { panel.destroy(); listeners.clear(); startInput.removeEventListener("input", onInput); endInput.removeEventListener("input", onInput); },
    };
}

export function parseDateInput(value: string): Date | null {
    const trimmed = value.trim();
    let year: number;
    let month: number;
    let day: number;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso !== null) {
        year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
    } else {
        const yearFirst = /^(\d{4})[\/]([0-9]{1,2})[\/]([0-9]{1,2})$/.exec(trimmed);
        if (yearFirst !== null) {
            year = Number(yearFirst[1]);
            month = Number(yearFirst[2]);
            day = Number(yearFirst[3]);
            const result = new Date(year, month - 1, day);
            return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
        }
        const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
        if (slash === null) return null;
        const first = Number(slash[1]);
        const second = Number(slash[2]);
        year = Number(slash[3]);
        month = first > 12 ? second : first;
        day = first > 12 ? first : second;
    }
    const result = new Date(year, month - 1, day);
    return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

export function parseMonthInput(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (match === null) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return new Date(year, month - 1, 1);
}

export function formatDateInput(value: Date): string {
    return `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1).toString().padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}`;
}

function parseDate(value: string): Date | null { return parseDateInput(value); }
function parseMonth(value: string): Date | null { return parseMonthInput(value); }
function formatDate(value: Date): string { return formatDateInput(value); }
function monthValue(value: Date): string {
    return `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1).toString().padStart(2, "0")}`;
}
