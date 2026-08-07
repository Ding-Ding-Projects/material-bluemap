/**
 * The surface the builder opens into.
 *
 * It stays visually attached to the field that opened it: anchored beside the affordance, tracking
 * that anchor while the page scrolls or resizes, flipping or shifting when it would leave the
 * viewport rather than drifting away from the control it belongs to. It paints its own background,
 * border, shape and elevation, so nothing behind it reads through.
 *
 * At widths where an anchored panel genuinely cannot fit it becomes a sheet instead. That is the
 * fallback, not the design, and even then focus returns to the field that opened it.
 */

const NARROW_QUERY = "(max-width: 719px)";
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 8;

import { attachPanelGeometry, type PanelGeometryController } from "../platform/PanelGeometry.js";

const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

let panelCounter = 0;

/**
 * Every currently-open panel, regardless of which caller created it.
 *
 * This is what lets a panel opened *from inside* another panel's content -- a colour
 * swatch's picker, a font trigger's list, both anchored to a `<button>` that lives
 * inside the appearance editor's own DOM -- avoid closing the panel it was opened
 * from, even though every `AnchoredPanel.element` is (see `show()` below) always a
 * fresh top-level child of `document.body`, never a descendant of whatever opened
 * it. See `isInsideNestedPanel` for the mechanism.
 */
const OPEN_PANELS = new Set<AnchoredPanel>();

export interface AnchoredPanelOptions {
    /** The control the panel hangs off, usually the builder button inside the search field. */
    readonly anchor: HTMLElement;
    /** Where focus goes when the panel closes. Usually the search input itself. */
    readonly returnFocusTo: HTMLElement;
    /** Accessible name for the panel. */
    readonly title: string;
    readonly onClose?: (() => void) | undefined;
    /**
     * The element whose own clicks should NOT count as "outside" the panel. Defaults to
     * `anchor`, which is correct for a small toggle button: pointerdown fires before click,
     * so without this exemption a second click on the same button would close the panel on
     * pointerdown and then reopen it on click, instead of toggling it shut.
     *
     * Pass `null` when `anchor` is only a position reference rather than a toggle control --
     * for example, the (possibly large) element an appearance editor opens beside. Treating
     * that whole element as "inside" the panel is exactly the bug where a menu or popover
     * refuses to close because almost every click on the page lands somewhere within the
     * surface it was anchored to.
     *
     * `null` here does not mean every click inside a nested popover closes this panel: a
     * separate mechanism (`isInsideNestedPanel`, using the module-level `OPEN_PANELS`
     * registry) already recognises a popover that was itself opened from a control inside
     * this panel's own rendered content -- a colour swatch's picker, a font trigger's list
     * -- and does not treat a click inside it as "outside". That is a narrower, dynamic
     * exemption scoped to whichever controls actually opened a child popover, not a static
     * grant to a whole wrapper element, so it does not reintroduce the bug this option
     * exists to fix.
     */
    readonly dismissBoundary?: HTMLElement | null;
    /** Stable persistence key for size and position. Defaults to the accessible title. */
    readonly geometryId?: string;
}

export class AnchoredPanel {
    readonly element: HTMLElement;

    private readonly options: AnchoredPanelOptions;
    private readonly dismissBoundary: HTMLElement | null;
    private readonly narrow: MediaQueryList | null;
    private open = false;
    private frame = 0;
    private readonly onDocumentKeydown: (event: KeyboardEvent) => void;
    private readonly onDocumentPointerDown: (event: Event) => void;
    private readonly onReposition: () => void;
    private resizeObserver: ResizeObserver | null = null;
    private readonly geometry: PanelGeometryController;

    constructor(options: AnchoredPanelOptions) {
        this.options = options;
        this.dismissBoundary =
            options.dismissBoundary === undefined ? options.anchor : options.dismissBoundary;
        this.narrow = typeof matchMedia === "function" ? matchMedia(NARROW_QUERY) : null;

        panelCounter += 1;
        this.element = document.createElement("div");
        this.element.className = "mbm-panel";
        this.element.id = `mbm-panel-${panelCounter}`;
        this.element.setAttribute("role", "dialog");
        this.element.setAttribute("aria-label", options.title);
        this.element.setAttribute("aria-modal", "false");
        this.element.hidden = true;
        this.geometry = attachPanelGeometry(this.element, {
            id: options.geometryId ?? `anchored.${options.title}`,
            floating: true,
            onReset: () => this.scheduleReposition(),
        });

        // The anchor announces what it opens and whether that surface is open right now.
        options.anchor.setAttribute("aria-haspopup", "dialog");
        options.anchor.setAttribute("aria-controls", this.element.id);
        options.anchor.setAttribute("aria-expanded", "false");

        this.onDocumentKeydown = (event) => this.handleKeydown(event);
        this.onDocumentPointerDown = (event) => this.handlePointerDown(event);
        this.onReposition = () => this.scheduleReposition();
    }

    get isOpen(): boolean {
        return this.open;
    }

    /** Show the panel. The content element is adopted, so callers keep their own reference. */
    show(content: HTMLElement): void {
        if (this.open) {
            return;
        }
        this.element.replaceChildren(content);
        this.geometry.mountToolbar();
        if (!this.element.isConnected) {
            document.body.append(this.element);
        }
        this.element.hidden = false;
        this.geometry.restore();
        this.open = true;
        OPEN_PANELS.add(this);
        this.options.anchor.setAttribute("aria-expanded", "true");

        const sheet = this.isNarrow();
        this.element.classList.toggle("mbm-panel--sheet", sheet);
        this.element.setAttribute("aria-modal", sheet ? "true" : "false");

        document.addEventListener("keydown", this.onDocumentKeydown, true);
        document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
        window.addEventListener("scroll", this.onReposition, true);
        window.addEventListener("resize", this.onReposition);

        if (typeof ResizeObserver === "function") {
            this.resizeObserver = new ResizeObserver(() => this.scheduleReposition());
            this.resizeObserver.observe(this.element);
        }

        this.reposition();
        this.focusFirst();
    }

    close(): void {
        if (!this.open) {
            return;
        }
        this.open = false;
        OPEN_PANELS.delete(this);
        this.element.hidden = true;
        this.element.replaceChildren();
        this.options.anchor.setAttribute("aria-expanded", "false");

        document.removeEventListener("keydown", this.onDocumentKeydown, true);
        document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
        window.removeEventListener("scroll", this.onReposition, true);
        window.removeEventListener("resize", this.onReposition);
        if (this.resizeObserver !== null) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.frame !== 0) {
            cancelAnimationFrame(this.frame);
            this.frame = 0;
        }

        // Returning focus is not optional: without it, closing a panel drops the visitor at
        // the top of the document with no idea where they were. But the element this panel was
        // opened for can have been removed from the DOM while the panel was still open (a page
        // re-render, the row it belonged to being closed by some other action) -- calling
        // .focus() on a disconnected node is a silent no-op per the HTML spec, and combined with
        // `this.element.hidden = true` just above dropping focus from whatever was focused
        // inside the panel, that leaves focus stranded on <body>. Mirrors the identical guard in
        // Overlay.close() (../platform/Overlay.ts).
        if (this.options.returnFocusTo.isConnected) {
            this.options.returnFocusTo.focus();
        }
        this.options.onClose?.();
    }

    destroy(): void {
        this.close();
        this.geometry.destroy();
        this.element.remove();
    }

    private isNarrow(): boolean {
        return this.narrow !== null && this.narrow.matches;
    }

    private focusFirst(): void {
        const focusable = this.element.querySelector<HTMLElement>(FOCUSABLE);
        if (focusable !== null) {
            focusable.focus();
        } else {
            this.element.tabIndex = -1;
            this.element.focus();
        }
    }

    private handleKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            // Escape must dismiss only the topmost popover, not every AnchoredPanel whose
            // listener happens to share this dispatch. Every panel's "keydown" listener is
            // registered on the same `document` node in the capture phase (see `show()`
            // below), and per the DOM spec listeners on the same node run in registration
            // order regardless of which panel is visually on top -- an outer panel (a
            // context menu, say) is always shown, and so always registered, before a
            // popover it goes on to host (that menu's own regex-builder button, opened
            // later from inside its content). Without this guard the outer listener would
            // fire first, close the outer panel, and cascade-close the inner one with it
            // via `onClose`, before the inner listener ever got its turn -- one Escape
            // press meant to dismiss just the nested popover instead discarded the whole
            // menu. Defer to a still-open panel that was opened from a control living
            // inside this panel's own content -- the same anchor-containment test
            // `isInsideNestedPanel` already uses for pointerdown -- so only the actual
            // topmost popover reacts, and an outer panel's own Escape handling still runs
            // normally once nothing is nested inside it anymore.
            if (this.hasOpenNestedPanel()) {
                return;
            }
            event.stopPropagation();
            event.preventDefault();
            this.close();
            return;
        }
        if (event.key !== "Tab" || !this.isNarrow()) {
            return;
        }
        // As a sheet the panel behaves modally, so Tab stays inside it.
        const focusable = [...this.element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (node) => node.offsetParent !== null || node === document.activeElement,
        );
        if (focusable.length === 0) {
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (first === undefined || last === undefined) {
            return;
        }
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    private handlePointerDown(event: Event): void {
        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }
        if (this.element.contains(target)) {
            return;
        }
        if (this.dismissBoundary !== null && this.dismissBoundary.contains(target)) {
            return;
        }
        if (this.isInsideNestedPanel(target)) {
            return;
        }
        this.close();
    }

    /**
     * True when `target` lands inside some other currently-open panel that was itself
     * opened from a control living inside THIS panel's own content -- a colour swatch's
     * picker, a font trigger's list, both anchored to a `<button>` the appearance editor
     * rendered as part of its own DOM.
     *
     * Every `AnchoredPanel.element` is, per `show()` above, always appended as a fresh
     * top-level child of `document.body` -- never nested inside whatever caller opened
     * it. So a click inside a nested popover is never literally "inside `this.element`"
     * and, when this panel's own `dismissBoundary` is `null` (as it must be for a large
     * position-only anchor like the appearance editor's), nothing above would stop this
     * panel from closing itself out from under the very popover it was hosting -- the
     * reported bug. The fix is not to widen `dismissBoundary` back into a large wrapper
     * (that reintroduces the original "menu never closes" bug this file exists to
     * prevent); it is to recognise the nested popover for what it is by walking the
     * chain of open panels from whichever one owns the click, through each panel's own
     * anchor, until an anchor lands inside this panel's element or the chain runs out.
     * Capped at a handful of hops so a pathological cycle cannot loop forever.
     */
    private isInsideNestedPanel(target: Node): boolean {
        let node: Node = target;
        for (let hop = 0; hop < 8; hop += 1) {
            const owner = AnchoredPanel.findOpenOwner(node);
            if (owner === null || owner === this) {
                return false;
            }
            if (this.element.contains(owner.options.anchor)) {
                return true;
            }
            node = owner.options.anchor;
        }
        return false;
    }

    /**
     * True when some other currently-open panel was itself opened from a control living
     * inside THIS panel's own rendered content -- i.e. this panel is not the topmost one
     * right now, and should let that other (nested) panel handle Escape instead of closing
     * itself out from under it. Mirrors `isInsideNestedPanel`'s anchor-containment test,
     * just checked against every open panel instead of a single click target.
     */
    private hasOpenNestedPanel(): boolean {
        for (const panel of OPEN_PANELS) {
            if (panel !== this && this.element.contains(panel.options.anchor)) {
                return true;
            }
        }
        return false;
    }

    /** The currently-open panel (if any) whose own element contains `node`. */
    private static findOpenOwner(node: Node): AnchoredPanel | null {
        for (const panel of OPEN_PANELS) {
            if (panel.element.contains(node)) {
                return panel;
            }
        }
        return null;
    }

    private scheduleReposition(): void {
        if (this.frame !== 0) {
            return;
        }
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.reposition();
        });
    }

    private reposition(): void {
        if (!this.open) {
            return;
        }
        if (this.isNarrow()) {
            this.element.classList.add("mbm-panel--sheet");
            this.element.setAttribute("aria-modal", "true");
            this.element.style.removeProperty("left");
            this.element.style.removeProperty("top");
            this.element.style.removeProperty("max-height");
            this.element.style.removeProperty("width");
            return;
        }

        if (this.geometry.detached) {
            this.geometry.constrain();
            return;
        }

        this.element.classList.remove("mbm-panel--sheet");
        this.element.setAttribute("aria-modal", "false");

        const anchor = this.options.anchor.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;

        const available = viewportWidth - VIEWPORT_MARGIN * 2;
        const width = Math.min(this.element.offsetWidth || 560, available);
        this.element.style.width = `${width}px`;

        let left = anchor.left;
        if (left + width > viewportWidth - VIEWPORT_MARGIN) {
            left = viewportWidth - VIEWPORT_MARGIN - width;
        }
        left = Math.max(VIEWPORT_MARGIN, left);

        const spaceBelow = viewportHeight - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
        const spaceAbove = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN;
        const placeBelow = spaceBelow >= 260 || spaceBelow >= spaceAbove;
        const maxHeight = Math.max(200, placeBelow ? spaceBelow : spaceAbove);
        const height = Math.min(this.element.offsetHeight || maxHeight, maxHeight);

        this.element.style.maxHeight = `${maxHeight}px`;
        this.element.style.left = `${Math.round(left)}px`;
        this.element.style.top = placeBelow
            ? `${Math.round(anchor.bottom + ANCHOR_GAP)}px`
            : `${Math.round(Math.max(VIEWPORT_MARGIN, anchor.top - ANCHOR_GAP - height))}px`;
        this.element.dataset.placement = placeBelow ? "below" : "above";
    }
}
