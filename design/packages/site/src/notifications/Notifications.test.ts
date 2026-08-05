// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { Notifications } from "./Notifications.js";

// `Notifications` itself keeps no persisted state, but it is constructed with a real
// `I18n`, and `I18n` reads its language preference through `Preferences`. Passing an
// explicit in-memory `Storage` here (rather than `window.localStorage`, which this
// jsdom environment does not provide) is the same pattern `I18n.test.ts` uses.
function makeI18n(): I18n {
    const cells = new Map<string, string>();
    const storage: Storage = {
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
        removeItem: (key) => void cells.delete(key),
        clear: () => cells.clear(),
        key: (index) => [...cells.keys()][index] ?? null,
        get length() {
            return cells.size;
        },
    };
    return new I18n(new Preferences(storage));
}

describe("Notifications", () => {
    let host: HTMLElement;

    beforeEach(() => {
        host = document.createElement("div");
        document.body.append(host);
    });

    afterEach(() => {
        host.remove();
        vi.useRealTimers();
    });

    it("renders a toast for every raised notification", () => {
        const notifications = new Notifications(makeI18n(), host);
        notifications.notify({ severity: "info", title: { text: "Saved" } });
        expect(host.querySelectorAll(".notification")).toHaveLength(1);
        expect(host.textContent).toContain("Saved");
    });

    it("keeps every raised notification in history, dismissed or not", () => {
        const notifications = new Notifications(makeI18n(), host);
        notifications.notify({ severity: "info", title: { text: "First" } });
        const id = notifications.notify({ severity: "success", title: { text: "Second" } });
        notifications.dismiss(id);
        expect(notifications.list()).toHaveLength(2);
    });

    it("auto-dismisses an info toast, but never a warning or an error", () => {
        vi.useFakeTimers();
        const notifications = new Notifications(makeI18n(), host);
        notifications.notify({ severity: "info", title: { text: "Info" } });
        notifications.notify({ severity: "warning", title: { text: "Warning" } });
        notifications.notify({ severity: "error", title: { text: "Error" } });

        vi.advanceTimersByTime(20000);

        expect(host.textContent).not.toContain("Info");
        expect(host.textContent).toContain("Warning");
        expect(host.textContent).toContain("Error");
    });

    it("pauses the auto-dismiss timer while the pointer is over the toast", () => {
        vi.useFakeTimers();
        const notifications = new Notifications(makeI18n(), host);
        notifications.notify({ severity: "info", title: { text: "Hover me" } });
        const node = host.querySelector(".notification")!;

        vi.advanceTimersByTime(3000);
        node.dispatchEvent(new Event("pointerenter"));
        vi.advanceTimersByTime(10000);
        // Still present: the timer was paused for the whole 10 s window above.
        expect(host.textContent).toContain("Hover me");

        node.dispatchEvent(new Event("pointerleave"));
        vi.advanceTimersByTime(6000);
        expect(host.textContent).not.toContain("Hover me");
    });

    it("queues a toast beyond the visible cap and shows it once room frees up", () => {
        const notifications = new Notifications(makeI18n(), host);
        const ids: string[] = [];
        for (let i = 0; i < 5; i++) {
            ids.push(notifications.notify({ severity: "error", title: { text: `Toast ${i}` } }));
        }
        // Only four are visible at once; the fifth is queued.
        expect(host.querySelectorAll(".notification")).toHaveLength(4);
        expect(host.textContent).not.toContain("Toast 4");

        notifications.dismiss(ids[0]!);
        expect(host.textContent).toContain("Toast 4");
    });

    it("runs a notification action and then dismisses the toast", () => {
        const notifications = new Notifications(makeI18n(), host);
        let ran = false;
        notifications.notify({
            severity: "info",
            title: { text: "Do a thing" },
            actions: [{ label: { text: "Do it" }, onSelect: () => (ran = true) }],
        });
        const button = host.querySelector<HTMLButtonElement>(".notification__action")!;
        button.click();
        expect(ran).toBe(true);
        expect(host.querySelectorAll(".notification")).toHaveLength(0);
    });

    it("clearAll empties both the live toasts and the history", () => {
        const notifications = new Notifications(makeI18n(), host);
        notifications.notify({ severity: "info", title: { text: "One" } });
        notifications.notify({ severity: "error", title: { text: "Two" } });
        notifications.clearAll();
        expect(notifications.list()).toEqual([]);
        expect(host.querySelectorAll(".notification")).toHaveLength(0);
    });

    it("removeMany forgets only the named records, keeping the rest of the history", () => {
        const notifications = new Notifications(makeI18n(), host);
        const first = notifications.notify({ severity: "info", title: { text: "One" } });
        const second = notifications.notify({ severity: "info", title: { text: "Two" } });
        notifications.notify({ severity: "info", title: { text: "Three" } });
        notifications.removeMany([first, second]);
        const left = notifications.list();
        expect(left).toHaveLength(1);
        expect(left[0]?.title).toEqual({ text: "Three" });
    });

    it("removeMany does nothing for an empty selection, and never throws on an unknown id", () => {
        const notifications = new Notifications(makeI18n(), host);
        notifications.notify({ severity: "info", title: { text: "Stays" } });
        notifications.removeMany([]);
        expect(notifications.list()).toHaveLength(1);
        expect(() => notifications.removeMany(["not-a-real-id"])).not.toThrow();
        expect(notifications.list()).toHaveLength(1);
    });

    it("removeMany notifies subscribers, the same as clearAll does", () => {
        const notifications = new Notifications(makeI18n(), host);
        const id = notifications.notify({ severity: "info", title: { text: "Watched" } });
        let notified = 0;
        notifications.subscribe(() => {
            notified += 1;
        });
        notifications.removeMany([id]);
        expect(notified).toBeGreaterThan(0);
    });

    it("renders an honest empty state in the notification centre with nothing raised", () => {
        const notifications = new Notifications(makeI18n(), host);
        const centre = document.createElement("div");
        notifications.renderCentre(centre);
        expect(centre.querySelector(".notification-centre__empty")).not.toBeNull();
    });

    it("renders every raised notification in the centre, including dismissed ones", () => {
        const notifications = new Notifications(makeI18n(), host);
        const id = notifications.notify({ severity: "warning", title: { text: "Careful" } });
        notifications.dismiss(id);
        const centre = document.createElement("div");
        notifications.renderCentre(centre);
        expect(centre.textContent).toContain("Careful");
    });

    it("gives the dismiss control an accessible name and a role matching severity", () => {
        const notifications = new Notifications(makeI18n(), host);
        notifications.notify({ severity: "error", title: { text: "Bad" } });
        const node = host.querySelector(".notification")!;
        expect(node.getAttribute("role")).toBe("alert");
        expect(node.getAttribute("aria-live")).toBe("assertive");
        const dismiss = node.querySelector(".notification__dismiss")!;
        expect(dismiss.getAttribute("aria-label")).not.toBe("");
    });
});
