/**
 * Non-blocking notifications.
 *
 * Anything that only informs becomes a toast in the corner: informational, success, progress
 * and errors the visitor does not have to decide about. Modal dialogs stay reserved for
 * decisions that genuinely block, which on this site means the bulk-close confirmation and
 * nothing else.
 *
 * Rules this implements, rather than aspires to:
 *   - toasts stack without overlapping, oldest at the bottom, newest above it;
 *   - info and success auto-dismiss, warning and error persist until dismissed, because a
 *     warning nobody read is a warning that was never shown;
 *   - the timer pauses while the pointer is over a toast or focus is inside it, so a toast
 *     cannot expire mid-sentence or mid-click;
 *   - every dismissed toast stays readable in the notification centre;
 *   - info and success announce politely, warning and error assertively;
 *   - the dismiss control is a full 44 pixel target.
 *
 * The site never raises a notification asking for money, a rating, a subscription, a sign-up
 * or a share. There is no code path here that could, and there should never be one.
 */

import { clear, el, icon, uniqueId } from "../platform/dom.js";
import type { I18n, TextSource } from "../i18n/I18n.js";
import type { IconName } from "../platform/icons.js";
import type { StringKey } from "../i18n/strings.js";

export const SEVERITIES = ["info", "success", "warning", "error"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type { TextSource };

export interface NotificationAction {
    readonly label: TextSource;
    readonly onSelect: () => void;
}

export interface NotificationLink {
    readonly label: TextSource;
    readonly href: string;
}

export interface NotificationInput {
    readonly severity?: Severity;
    readonly title: TextSource;
    readonly body?: TextSource;
    readonly actions?: readonly NotificationAction[];
    readonly link?: NotificationLink;
    /** Override the auto-dismiss delay. Warnings and errors ignore it; they never expire. */
    readonly timeoutMs?: number;
}

export interface NotificationRecord {
    readonly id: string;
    readonly severity: Severity;
    readonly title: TextSource;
    readonly body: TextSource | null;
    readonly at: Date;
}

const AUTO_DISMISS_MS: Record<Severity, number | null> = {
    info: 6000,
    success: 5000,
    warning: null,
    error: null,
};

const SEVERITY_ICON: Record<Severity, IconName> = {
    info: "info",
    success: "checkCircle",
    warning: "warning",
    error: "errorCircle",
};

const SEVERITY_LABEL: Record<Severity, StringKey> = {
    info: "notify.severity.info",
    success: "notify.severity.success",
    warning: "notify.severity.warning",
    error: "notify.severity.error",
};

const MAX_VISIBLE = 4;
const HISTORY_LIMIT = 50;

interface LiveToast {
    readonly record: NotificationRecord;
    readonly node: HTMLElement;
    timer: number | null;
    remaining: number | null;
    startedAt: number;
}

interface QueuedToast {
    readonly record: NotificationRecord;
    readonly input: NotificationInput;
}

export class Notifications {
    private readonly i18n: I18n;
    private readonly region: HTMLElement;
    private readonly live: LiveToast[] = [];
    private readonly queue: QueuedToast[] = [];
    private history: NotificationRecord[] = [];
    private readonly listeners = new Set<() => void>();

    constructor(i18n: I18n, host: HTMLElement) {
        this.i18n = i18n;
        this.region = el("div", {
            class: "toast-region",
            attrs: { role: "region", "aria-label": i18n.t("notify.regionLabel") },
        });
        i18n.bindAttr(this.region, "aria-label", "notify.regionLabel");
        host.append(this.region);
    }

    /** Everything raised this session, newest first. Nothing is written to storage. */
    list(): readonly NotificationRecord[] {
        return this.history;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    notify(input: NotificationInput): string {
        const severity = input.severity ?? "info";
        const record: NotificationRecord = {
            id: uniqueId("toast"),
            severity,
            title: input.title,
            body: input.body ?? null,
            at: new Date(),
        };
        this.history = [record, ...this.history].slice(0, HISTORY_LIMIT);

        if (this.live.length >= MAX_VISIBLE) {
            this.queue.push({ record, input });
        } else {
            this.show(record, input);
        }
        this.emit();
        return record.id;
    }

    dismiss(id: string): void {
        const index = this.live.findIndex((toast) => toast.record.id === id);
        if (index < 0) return;
        const toast = this.live[index];
        if (toast === undefined) return;
        if (toast.timer !== null) window.clearTimeout(toast.timer);
        toast.node.remove();
        this.live.splice(index, 1);
        const next = this.queue.shift();
        if (next !== undefined) this.show(next.record, next.input);
        this.emit();
    }

    /** Clear the on-screen toasts and the centre's log together. */
    clearAll(): void {
        for (const toast of [...this.live]) {
            if (toast.timer !== null) window.clearTimeout(toast.timer);
            toast.node.remove();
        }
        this.live.length = 0;
        this.queue.length = 0;
        this.history = [];
        this.emit();
    }

    /**
     * Render the notification centre into a container. The centre is how a dismissed
     * notification stays reviewable, so it lists everything raised this session including
     * toasts that have already expired.
     */
    renderCentre(container: HTMLElement): void {
        clear(container);
        if (this.history.length === 0) {
            const empty = el("p", { class: "md-body-medium notification-centre__empty" });
            this.i18n.bindText(empty, "notify.centreEmpty");
            container.append(empty);
            return;
        }

        const list = el("ul", { class: "notification-centre__list", attrs: { role: "list" } });
        for (const record of this.history) {
            const item = el("li", { class: `notification-centre__item notification-centre__item--${record.severity}` });

            const head = el("div", { class: "notification-centre__head" });
            head.append(icon(SEVERITY_ICON[record.severity], "notification__icon"));

            const severityLabel = el("span", { class: "md-visually-hidden" });
            this.i18n.bindText(severityLabel, SEVERITY_LABEL[record.severity]);
            head.append(severityLabel);

            const title = el("span", { class: "md-title-small notification-centre__title" });
            this.applyText(title, record.title);
            head.append(title);

            head.append(
                el("time", {
                    class: "md-label-small notification-centre__time",
                    text: record.at.toLocaleTimeString(),
                    attrs: { datetime: record.at.toISOString() },
                }),
            );
            item.append(head);

            if (record.body !== null) {
                const body = el("p", { class: "md-body-small notification-centre__body" });
                this.applyText(body, record.body);
                item.append(body);
            }
            list.append(item);
        }
        container.append(list);
    }

    private show(record: NotificationRecord, input: NotificationInput): void {
        const node = el("div", {
            class: `notification notification--${record.severity}`,
            attrs: {
                role: record.severity === "warning" || record.severity === "error" ? "alert" : "status",
                "aria-live": record.severity === "warning" || record.severity === "error" ? "assertive" : "polite",
            },
        });

        node.append(icon(SEVERITY_ICON[record.severity], "notification__icon"));

        const content = el("div", { class: "notification__content" });
        const severityLabel = el("span", { class: "md-visually-hidden" });
        this.i18n.bindText(severityLabel, SEVERITY_LABEL[record.severity]);
        content.append(severityLabel);

        const title = el("p", { class: "md-title-small notification__title" });
        this.applyText(title, record.title);
        content.append(title);

        if (record.body !== null) {
            const body = el("p", { class: "md-body-small notification__body" });
            this.applyText(body, record.body);
            content.append(body);
        }

        const actions = input.actions ?? [];
        if (actions.length > 0 || input.link !== undefined) {
            const row = el("div", { class: "notification__actions" });
            for (const action of actions) {
                const button = el("button", { class: "md-button md-button--text notification__action", attrs: { type: "button" } });
                this.applyText(button, action.label);
                button.addEventListener("click", () => {
                    action.onSelect();
                    this.dismiss(record.id);
                });
                row.append(button);
            }
            if (input.link !== undefined) {
                const link = el("a", {
                    class: "md-button md-button--text notification__action",
                    attrs: { href: input.link.href, rel: "noopener" },
                });
                this.applyText(link, input.link.label);
                row.append(link);
            }
            content.append(row);
        }
        node.append(content);

        const dismiss = el("button", { class: "md-icon-button notification__dismiss", attrs: { type: "button" } });
        this.i18n.bindAttr(dismiss, "aria-label", "notify.dismiss");
        dismiss.append(icon("close"));
        dismiss.addEventListener("click", () => {
            this.dismiss(record.id);
        });
        node.append(dismiss);

        this.region.append(node);

        const timeout = AUTO_DISMISS_MS[record.severity];
        const configured = input.timeoutMs;
        const delay = timeout === null ? null : (configured ?? timeout);
        const toast: LiveToast = { record, node, timer: null, remaining: delay, startedAt: 0 };
        this.live.push(toast);

        if (delay !== null) {
            this.startTimer(toast);
            // Reading takes as long as it takes. Hovering or focusing holds the toast open,
            // so an auto-dismiss can never remove something mid-read or mid-click.
            const pause = (): void => this.pauseTimer(toast);
            const resume = (): void => this.startTimer(toast);
            node.addEventListener("pointerenter", pause);
            node.addEventListener("pointerleave", resume);
            node.addEventListener("focusin", pause);
            node.addEventListener("focusout", resume);
        }
    }

    private startTimer(toast: LiveToast): void {
        if (toast.remaining === null || toast.timer !== null) return;
        toast.startedAt = Date.now();
        toast.timer = window.setTimeout(() => {
            toast.timer = null;
            this.dismiss(toast.record.id);
        }, toast.remaining);
    }

    private pauseTimer(toast: LiveToast): void {
        if (toast.timer === null || toast.remaining === null) return;
        window.clearTimeout(toast.timer);
        toast.remaining = Math.max(1200, toast.remaining - (Date.now() - toast.startedAt));
        toast.timer = null;
    }

    private applyText(node: HTMLElement, source: TextSource): void {
        this.i18n.applyTo(node, source);
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}
