/**
 * The confirmation gate for a destructive settings action.
 *
 * This is deliberately modal: it is one of the few places where the visitor has to
 * decide before anything else can happen, which is exactly what a modal dialog is
 * for. Everything that only informs is a notification instead.
 *
 * The gate deliberately lives in the site's own UI layer. Two independent key
 * challenges unlock a full-range slider; the destructive caller never receives a
 * positive answer until every step is complete.
 */

import { el } from "../platform/dom.js";
import { t } from "./i18n.js";

export type DestructiveGate = (message: string) => Promise<boolean>;

let gate: DestructiveGate | null = null;

/** Replace the built-in confirmation with a stronger one. */
export function installDestructiveGate(next: DestructiveGate | null): void {
    gate = next;
}

export function confirmDestructive(message: string): Promise<boolean> {
    if (gate !== null) return gate(message);
    return defaultGate(message);
}

function defaultGate(message: string): Promise<boolean> {
    return new Promise((resolve) => {
        const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = el("dialog", { class: "mb-confirm mb-confirm--super", attrs: { "aria-labelledby": "mb-confirm-title" } });
        const heading = el("h2", { class: "mb-confirm-title", text: t("confirm.title"), attrs: { id: "mb-confirm-title" } });
        const body = el("p", { class: "mb-confirm-body", text: message });
        const warning = el("p", { class: "mb-confirm-warning", text: t("confirm.irreversible") });

        const instructions = el("p", { class: "mb-confirm-body", text: t("confirm.super.instructions") });
        const first = el("input", {
            class: "md-field__input mb-confirm-key",
            attrs: { type: "text", autocomplete: "off", spellcheck: "false", "aria-label": t("confirm.super.firstLabel") },
        });
        const second = el("input", {
            class: "md-field__input mb-confirm-key",
            attrs: { type: "text", autocomplete: "off", spellcheck: "false", "aria-label": t("confirm.super.secondLabel") },
        });
        const firstLabel = el("label", { class: "md-field__label", text: t("confirm.super.firstLabel") });
        const secondLabel = el("label", { class: "md-field__label", text: t("confirm.super.secondLabel") });
        const progress = el("div", { class: "mb-confirm-progress", attrs: { role: "status", "aria-live": "polite" } });
        const slider = el("input", {
            class: "mb-confirm-slider",
            attrs: { type: "range", min: 0, max: 100, value: 0, disabled: true, "aria-label": t("confirm.super.sliderLabel") },
        });
        const sliderLabel = el("label", { class: "md-field__label", text: t("confirm.super.sliderLabel") });

        const cancel = el("button", {
            class: "md-button md-button--outlined",
            text: t("confirm.super.emergency"),
            attrs: { type: "button" },
        });
        const proceed = el("button", {
            class: "md-button md-button--filled md-button--danger",
            text: t("confirm.proceed"),
            attrs: { type: "button" },
        });

        let settled = false;
        const finish = (value: boolean): void => {
            if (settled) return;
            settled = true;
            // Guarded the same way `showModal` is below: every real browser implements
            // `<dialog>.close()`, but an environment that does not (a headless test DOM
            // without full dialog support) must still tear the element down rather than
            // throw out from inside a promise executor.
            if (typeof dialog.close === "function") dialog.close();
            dialog.remove();
            origin?.focus({ preventScroll: true });
            resolve(value);
        };

        const updateUnlock = (): void => {
            const unlocked = first.value.trim().toUpperCase() === "RESET" && second.value.trim().toUpperCase() === "ALL";
            slider.disabled = !unlocked;
            if (!unlocked) slider.value = "0";
            progress.textContent = unlocked ? t("confirm.super.unlocked") : t("confirm.super.locked");
            progress.classList.toggle("mb-confirm-progress--armed", unlocked);
        };
        first.addEventListener("input", updateUnlock);
        second.addEventListener("input", updateUnlock);
        slider.addEventListener("input", () => {
            const value = Number(slider.value);
            progress.style.setProperty("--mb-confirm-progress", `${value}%`);
            progress.classList.add("mb-confirm-progress--moving");
            if (value >= 100 && !settled) {
                progress.classList.remove("mb-confirm-progress--moving");
                progress.classList.add("mb-confirm-progress--complete");
                progress.textContent = t("confirm.super.complete");
                window.setTimeout(() => finish(true), 320);
            }
        });

        cancel.addEventListener("click", () => {
            finish(false);
        });
        proceed.disabled = true;
        proceed.addEventListener("click", () => {
            if (!slider.disabled && Number(slider.value) >= 100) finish(true);
        });
        // Escape and the browser's own dismissal both mean "no". Treating a dismissal
        // as consent is the one mistake a destructive gate must never make.
        dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            finish(false);
        });
        dialog.addEventListener("close", () => {
            finish(false);
        });

        dialog.append(
            heading,
            body,
            warning,
            instructions,
            el("div", { class: "mb-confirm-key-row" }, firstLabel, first),
            el("div", { class: "mb-confirm-key-row" }, secondLabel, second),
            sliderLabel,
            slider,
            progress,
            el("div", { class: "mb-confirm-actions" }, cancel, proceed)
        );
        document.body.append(dialog);
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        updateUnlock();
        cancel.focus();
    });
}
