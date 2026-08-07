import type { Preferences } from "../platform/Preferences.js";

export const SIDEBAR_COLLAPSED_KEY = "tabs.sidebarCollapsed";

export type SidebarListener = () => void;
export type SidebarPlacement = "left" | "right" | "top" | "bottom";

export interface SidebarDom {
    readonly workspace: HTMLElement;
    readonly topbar: HTMLElement;
    readonly navigation: HTMLElement;
    readonly toggle: HTMLButtonElement;
}

export interface AppliedSidebarState {
    readonly collapsed: boolean;
    readonly chevron: "left" | "right";
}

/** Apply one state snapshot without moving focus away from the persistent toggle. */
export function applySidebarNavigation(
    dom: SidebarDom,
    placement: SidebarPlacement,
    requestedCollapsed: boolean,
    labels: { readonly collapse: string; readonly expand: string },
): AppliedSidebarState {
    const vertical = placement === "left" || placement === "right";
    const collapsed = vertical && requestedCollapsed;
    dom.workspace.dataset["tabPlacement"] = placement;
    dom.workspace.dataset["sidebarCollapsed"] = collapsed ? "true" : "false";
    dom.topbar.dataset["placement"] = placement;
    dom.topbar.dataset["sidebarCollapsed"] = collapsed ? "true" : "false";
    dom.navigation.hidden = collapsed;
    dom.toggle.hidden = !vertical;
    dom.toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    const label = collapsed ? labels.expand : labels.collapse;
    dom.toggle.setAttribute("aria-label", label);
    dom.toggle.title = label;
    return {
        collapsed,
        chevron:
            (placement === "left" && collapsed) || (placement === "right" && !collapsed)
                ? "right"
                : "left",
    };
}

/**
 * Persisted collapse state for the left/right site navigation rail.
 *
 * A compact first visit starts collapsed so the navigation cannot consume nearly half of a
 * phone viewport. Once the visitor makes a choice, that choice wins at every width until it is
 * reset. Horizontal tab placements ignore the visual state without deleting it, so returning
 * to a side placement restores the visitor's last choice.
 */
export class SidebarNavigation {
    private readonly prefs: Preferences;
    private readonly defaultCollapsed: boolean;
    private readonly listeners = new Set<SidebarListener>();
    private collapsedValue: boolean;
    private storedValue: boolean;

    constructor(prefs: Preferences, compactFirstVisit: boolean) {
        this.prefs = prefs;
        this.defaultCollapsed = compactFirstVisit;
        const raw = prefs.read(SIDEBAR_COLLAPSED_KEY, "unset");
        this.storedValue = raw === "true" || raw === "false";
        this.collapsedValue = this.storedValue ? raw === "true" : compactFirstVisit;

        prefs.subscribe((key) => {
            if (key !== SIDEBAR_COLLAPSED_KEY) return;
            const next = prefs.read(SIDEBAR_COLLAPSED_KEY, "unset");
            this.storedValue = next === "true" || next === "false";
            this.collapsedValue = this.storedValue ? next === "true" : this.defaultCollapsed;
            this.emit();
        });
    }

    get collapsed(): boolean {
        return this.collapsedValue;
    }

    get provenance(): "stored" | "responsive default" {
        return this.storedValue ? "stored" : "responsive default";
    }

    setCollapsed(collapsed: boolean): void {
        if (this.collapsedValue === collapsed && this.storedValue) return;
        this.collapsedValue = collapsed;
        this.storedValue = true;
        this.prefs.write(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    }

    toggle(): void {
        this.setCollapsed(!this.collapsedValue);
    }

    reset(): void {
        this.collapsedValue = this.defaultCollapsed;
        this.storedValue = false;
        this.prefs.remove(SIDEBAR_COLLAPSED_KEY);
    }

    subscribe(listener: SidebarListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(): void {
        for (const listener of [...this.listeners]) listener();
    }
}
