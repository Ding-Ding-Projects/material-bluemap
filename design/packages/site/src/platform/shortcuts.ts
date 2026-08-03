/**
 * The one place a keyboard shortcut is defined.
 *
 * A shortcut is registered here with the keys that trigger it, and menus read their shortcut
 * text from the same record. That is the whole point: a menu cannot advertise a key that does
 * nothing, and a key cannot exist that no menu mentions, because both come from one entry.
 *
 * Shortcuts do not fire while the visitor is typing. Every registration is skipped when the
 * event target is a text input, a textarea, a select or an editable element, so a pattern
 * containing the letter W never closes a page.
 */

import { formatShortcut } from "./dom.js";

export interface ShortcutRegistration {
    readonly id: string;
    /** Keys in display order, for example ["Shift", "Alt", "W"]. */
    readonly parts: readonly string[];
    readonly run: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function signature(parts: readonly string[]): string {
    const modifiers = new Set(parts.slice(0, -1).map((part) => part.toLowerCase()));
    const key = (parts[parts.length - 1] ?? "").toLowerCase();
    return [
        modifiers.has("ctrl") ? "ctrl" : "",
        modifiers.has("alt") ? "alt" : "",
        modifiers.has("shift") ? "shift" : "",
        key,
    ].join("+");
}

function eventSignature(event: KeyboardEvent): string {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key.toLowerCase();
    return [event.ctrlKey || event.metaKey ? "ctrl" : "", event.altKey ? "alt" : "", event.shiftKey ? "shift" : "", key].join(
        "+",
    );
}

export class ShortcutRegistry {
    private readonly byId = new Map<string, ShortcutRegistration>();
    private readonly bySignature = new Map<string, ShortcutRegistration>();

    constructor(target: EventTarget = window) {
        target.addEventListener("keydown", (event) => {
            if (!(event instanceof KeyboardEvent)) return;
            if (isTypingTarget(event.target)) return;
            const match = this.bySignature.get(eventSignature(event));
            if (match === undefined) return;
            event.preventDefault();
            match.run();
        });
    }

    register(registration: ShortcutRegistration): void {
        this.byId.set(registration.id, registration);
        this.bySignature.set(signature(registration.parts), registration);
    }

    /**
     * The shortcut for an action, formatted for this platform, or null when the action has
     * none. Menus show nothing rather than a placeholder when this returns null.
     */
    display(id: string): string | null {
        const registration = this.byId.get(id);
        return registration === undefined ? null : formatShortcut(registration.parts);
    }

    run(id: string): void {
        this.byId.get(id)?.run();
    }
}
