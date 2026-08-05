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

const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

let panelCounter = 0;

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
     */
    readonly dismissBoundary?: HTMLElement | null;
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

    constructor(options: AnchoredPanelOptions) {
        this.options = options;
        this.dismissBoundary =
            options.dismissBoundary === undefined ? options.anchor : options.dismissBoundary;
        this.narrow =
            typeof matchMedia === "function" ? matchMedia(NARROW_QUERY) : null;

        panelCounter += 1;
        this.element = document.createElement("div");
        this.element.className = "mbm-panel";
        this.element.id = `mbm-panel-${panelCounter}`;
        this.element.setAttribute("role", "dialog");
        this.element.setAttribute("aria-label", options.title);
        this.element.setAttribute("aria-modal", "false");
        this.element.hidden = true;

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
        if (!this.element.isConnected) {
            document.body.append(this.element);
        }
        this.element.hidden = false;
        this.open = true;
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

        this.options.returnFocusTo.focus();
        this.options.onClose?.();
    }

    destroy(): void {
        this.close();
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
        this.close();
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
