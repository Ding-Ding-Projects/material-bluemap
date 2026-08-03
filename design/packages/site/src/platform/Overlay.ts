/**
 * Anchored overlays: the popovers, menus and panels that hang off a control.
 *
 * One implementation, because the things that make an overlay correct are the things that
 * get forgotten when each surface writes its own:
 *
 *   - it paints its own background, border, elevation and shape, so nothing reads through it;
 *   - it is bounded by the viewport and scrolls inside that bound, so content past the cap is
 *     reachable instead of silently cut off;
 *   - it flips to the other side of its anchor rather than sliding away from it;
 *   - Escape closes it, a click outside closes it, and focus returns to the control that
 *     opened it either way;
 *   - it tracks its anchor on scroll and resize while open.
 *
 * It is deliberately not a modal. Nothing here traps focus or blocks the page, because
 * nothing that only shows information should.
 */

import { focusableWithin, positionOverlay, type AnchorPlacement } from "./dom.js";

export interface OverlayOptions extends AnchorPlacement {
    /** Accessible name for the overlay region. */
    readonly label: string;
    /** Focus this when the overlay opens. Defaults to the first focusable descendant. */
    readonly initialFocus?: HTMLElement;
    readonly onClose?: () => void;
    /** `dialog` for panels a visitor interacts with, `menu` for command lists. */
    readonly role?: "dialog" | "menu" | "group";
}

export class Overlay {
    readonly element: HTMLElement;
    private readonly anchor: HTMLElement;
    private readonly options: OverlayOptions;
    private readonly onDocumentPointerDown: (event: PointerEvent) => void;
    private readonly onKeyDown: (event: KeyboardEvent) => void;
    private readonly onReflow: () => void;
    private isOpen = false;

    constructor(anchor: HTMLElement, options: OverlayOptions) {
        this.anchor = anchor;
        this.options = options;

        this.element = document.createElement("div");
        this.element.className = "md-surface-overlay";
        this.element.setAttribute("role", options.role ?? "dialog");
        this.element.setAttribute("aria-label", options.label);

        this.onDocumentPointerDown = (event) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (this.element.contains(target) || this.anchor.contains(target)) return;
            this.close();
        };

        this.onKeyDown = (event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            event.preventDefault();
            this.close();
        };

        this.onReflow = () => {
            if (this.isOpen) positionOverlay(this.element, this.anchor, this.options);
        };
    }

    get open(): boolean {
        return this.isOpen;
    }

    show(): void {
        if (this.isOpen) return;
        this.isOpen = true;
        document.body.append(this.element);
        positionOverlay(this.element, this.anchor, this.options);

        // Pointerdown rather than click: a click that starts inside and ends outside should
        // not close the overlay, and a click that starts outside should close it immediately.
        document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
        this.element.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("resize", this.onReflow);
        window.addEventListener("scroll", this.onReflow, true);

        const target = this.options.initialFocus ?? focusableWithin(this.element)[0];
        target?.focus();
    }

    close(): void {
        if (!this.isOpen) return;
        this.isOpen = false;
        document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
        this.element.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("resize", this.onReflow);
        window.removeEventListener("scroll", this.onReflow, true);
        this.element.remove();
        this.options.onClose?.();
        // Returning focus is not optional: without it, closing a menu drops the visitor at
        // the top of the document with no idea where they were.
        if (this.anchor.isConnected) this.anchor.focus();
    }

    toggle(): boolean {
        if (this.isOpen) this.close();
        else this.show();
        return this.isOpen;
    }

    /** Reposition after the content changed size. */
    reflow(): void {
        this.onReflow();
    }
}
