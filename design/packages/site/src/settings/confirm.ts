/**
 * The confirmation gate for a destructive settings action.
 *
 * This is deliberately modal: it is one of the few places where the visitor has to
 * decide before anything else can happen, which is exactly what a modal dialog is
 * for. Everything that only informs is a notification instead.
 *
 * A stronger gate belongs here when the super-confirmation surface lands. Until
 * then this is a plain, honest confirmation rather than a decorative imitation of
 * one: `installDestructiveGate` replaces it without any caller changing.
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
        const dialog = el("dialog", { class: "mb-confirm", attrs: { "aria-labelledby": "" } });
        const heading = el("h2", { class: "mb-confirm-title", text: t("confirm.title") });
        const body = el("p", { class: "mb-confirm-body", text: message });
        const warning = el("p", { class: "mb-confirm-warning", text: t("confirm.irreversible") });

        const cancel = el("button", {
            class: "md-button md-button--outlined",
            text: t("confirm.cancel"),
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
            dialog.close();
            dialog.remove();
            resolve(value);
        };

        cancel.addEventListener("click", () => {
            finish(false);
        });
        proceed.addEventListener("click", () => {
            finish(true);
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
            el("div", { class: "mb-confirm-actions" }, cancel, proceed)
        );
        document.body.append(dialog);
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        cancel.focus();
    });
}
