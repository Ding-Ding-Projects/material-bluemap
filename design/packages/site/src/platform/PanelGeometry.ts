import { Preferences } from "./Preferences.js";

const VERSION = 1;
const MARGIN = 12;
const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;
const STEP = 24;

interface StoredGeometry {
    readonly version: typeof VERSION;
    readonly width: number;
    readonly height: number;
    readonly x?: number;
    readonly y?: number;
}

export interface PanelGeometryOptions {
    readonly id: string;
    readonly floating: boolean;
    readonly preferences?: Preferences;
    readonly onReset?: () => void;
}

export interface PanelGeometryController {
    readonly detached: boolean;
    mountToolbar(): void;
    restore(): void;
    constrain(): void;
    reset(): void;
    destroy(): void;
}

/**
 * Makes a panel resizeable, and floating panels draggable, without giving each
 * dialog a slightly different persistence format and keyboard story.
 */
export function attachPanelGeometry(
    element: HTMLElement,
    options: PanelGeometryOptions,
): PanelGeometryController {
    const prefs = options.preferences ?? new Preferences();
    const key = `panel.geometry.v1.${safeId(options.id)}`;
    let value = prefs.readJson(key, reviveGeometry) ?? null;
    let detached = options.floating && value?.x !== undefined && value.y !== undefined;
    let dragging: {
        pointerId: number;
        startX: number;
        startY: number;
        x: number;
        y: number;
    } | null = null;
    let resizing = false;

    element.classList.add("mb-resizable-panel");
    if (options.floating) element.classList.add("mb-draggable-panel");

    const onKeydown = (event: KeyboardEvent): void => {
        if (!event.altKey || event.key === "Alt") return;
        const direction = arrowDelta(event.key);
        if (direction === null) return;
        event.preventDefault();
        if (event.shiftKey) resizeBy(direction.x * STEP, direction.y * STEP);
        else if (options.floating) moveBy(direction.x * STEP, direction.y * STEP);
    };
    const onPointerDown = (event: PointerEvent): void => {
        const rect = element.getBoundingClientRect();
        resizing = event.clientX >= rect.right - 24 && event.clientY >= rect.bottom - 24;
    };
    const onPointerUp = (): void => {
        if (resizing) persistFromElement();
        resizing = false;
    };
    element.addEventListener("keydown", onKeydown);
    element.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    function mountToolbar(): void {
        element.querySelector(":scope > .mb-panel-geometry-toolbar")?.remove();
        const toolbar = document.createElement("div");
        toolbar.className = "mb-panel-geometry-toolbar";
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", "Panel size and position · Panel 大小同位置");
        toolbar.dataset["panelDragHandle"] = "true";
        const controls: readonly [string, string, () => void][] = [
            ["↔", "Wider panel · 加闊 panel", () => resizeBy(STEP, 0)],
            ["↕", "Taller panel · 加高 panel", () => resizeBy(0, STEP)],
            ["−", "Smaller panel · 縮細 panel", () => resizeBy(-STEP, -STEP)],
            ["↺", "Reset panel size and position · 重設 panel 大小同位置", reset],
        ];
        for (const [glyph, label, run] of controls) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "md-icon-button mb-panel-geometry-button";
            button.textContent = glyph;
            button.setAttribute("aria-label", label);
            button.title = label;
            button.addEventListener("click", run);
            toolbar.append(button);
        }
        if (options.floating) {
            toolbar.addEventListener("pointerdown", startDrag);
            toolbar.title = "Drag to move; Alt+Arrow moves; Alt+Shift+Arrow resizes · 拖曳移動";
        }
        element.prepend(toolbar);
    }

    function startDrag(event: PointerEvent): void {
        if (event.button !== 0 || event.target instanceof HTMLButtonElement) return;
        const rect = element.getBoundingClientRect();
        dragging = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: rect.left,
            y: rect.top,
        };
        detached = true;
        element.dataset["panelDetached"] = "true";
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        window.addEventListener("pointermove", drag);
        window.addEventListener("pointerup", endDrag, { once: true });
        event.preventDefault();
    }

    function drag(event: PointerEvent): void {
        if (dragging === null || dragging.pointerId !== event.pointerId) return;
        setPosition(
            dragging.x + event.clientX - dragging.startX,
            dragging.y + event.clientY - dragging.startY,
        );
    }

    function endDrag(): void {
        window.removeEventListener("pointermove", drag);
        dragging = null;
        persistFromElement();
    }

    function resizeBy(deltaWidth: number, deltaHeight: number): void {
        const rect = element.getBoundingClientRect();
        element.style.width = `${clamp(rect.width + deltaWidth, Math.min(MIN_WIDTH, viewportWidth()), viewportWidth())}px`;
        element.style.height = `${clamp(rect.height + deltaHeight, Math.min(MIN_HEIGHT, viewportHeight()), viewportHeight())}px`;
        constrain();
        persistFromElement();
    }

    function moveBy(deltaX: number, deltaY: number): void {
        const rect = element.getBoundingClientRect();
        detached = true;
        element.dataset["panelDetached"] = "true";
        setPosition(rect.left + deltaX, rect.top + deltaY);
        persistFromElement();
    }

    function setPosition(x: number, y: number): void {
        const width = element.getBoundingClientRect().width || value?.width || MIN_WIDTH;
        const height = element.getBoundingClientRect().height || value?.height || MIN_HEIGHT;
        element.style.position = "fixed";
        element.style.right = "auto";
        element.style.bottom = "auto";
        element.style.left = `${clamp(x, MARGIN, Math.max(MARGIN, window.innerWidth - width - MARGIN))}px`;
        element.style.top = `${clamp(y, MARGIN, Math.max(MARGIN, window.innerHeight - height - MARGIN))}px`;
    }

    function restore(): void {
        value = prefs.readJson(key, reviveGeometry) ?? value;
        if (value === null) return;
        element.style.width = `${clamp(value.width, Math.min(MIN_WIDTH, viewportWidth()), viewportWidth())}px`;
        element.style.height = `${clamp(value.height, Math.min(MIN_HEIGHT, viewportHeight()), viewportHeight())}px`;
        detached = options.floating && value.x !== undefined && value.y !== undefined;
        if (detached && value.x !== undefined && value.y !== undefined) {
            element.dataset["panelDetached"] = "true";
            setPosition(value.x, value.y);
        }
        constrain();
    }

    function constrain(): void {
        const maxWidth = viewportWidth();
        const maxHeight = viewportHeight();
        element.style.maxWidth = `${maxWidth}px`;
        element.style.maxHeight = `${maxHeight}px`;
        const rect = element.getBoundingClientRect();
        if (rect.width > maxWidth) element.style.width = `${maxWidth}px`;
        if (rect.height > maxHeight) element.style.height = `${maxHeight}px`;
        if (detached) setPosition(rect.left, rect.top);
    }

    function persistFromElement(): void {
        const rect = element.getBoundingClientRect();
        value = {
            version: VERSION,
            width: clamp(rect.width, Math.min(MIN_WIDTH, viewportWidth()), viewportWidth()),
            height: clamp(rect.height, Math.min(MIN_HEIGHT, viewportHeight()), viewportHeight()),
            ...(detached && options.floating ? { x: rect.left, y: rect.top } : {}),
        };
        prefs.writeJson(key, value);
    }

    function reset(): void {
        prefs.remove(key);
        value = null;
        detached = false;
        delete element.dataset["panelDetached"];
        for (const property of [
            "width",
            "height",
            "left",
            "top",
            "right",
            "bottom",
            "max-width",
            "max-height",
            "position",
        ]) {
            element.style.removeProperty(property);
        }
        options.onReset?.();
    }

    function destroy(): void {
        window.removeEventListener("pointermove", drag);
        window.removeEventListener("pointerup", onPointerUp);
        element.removeEventListener("keydown", onKeydown);
        element.removeEventListener("pointerdown", onPointerDown);
    }

    return {
        get detached() {
            return detached;
        },
        mountToolbar,
        restore,
        constrain,
        reset,
        destroy,
    };
}

function reviveGeometry(value: unknown): StoredGeometry | undefined {
    if (typeof value !== "object" || value === null) return undefined;
    const candidate = value as Partial<StoredGeometry>;
    if (candidate.version !== VERSION || !finite(candidate.width) || !finite(candidate.height))
        return undefined;
    if ((candidate.x === undefined) !== (candidate.y === undefined)) return undefined;
    if (candidate.x !== undefined && (!finite(candidate.x) || !finite(candidate.y)))
        return undefined;
    return {
        version: VERSION,
        width: candidate.width,
        height: candidate.height,
        ...(candidate.x === undefined ? {} : { x: candidate.x, y: candidate.y }),
    };
}

function finite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
function viewportWidth(): number {
    return Math.max(1, window.innerWidth - MARGIN * 2);
}
function viewportHeight(): number {
    return Math.max(1, window.innerHeight - MARGIN * 2);
}
function safeId(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .slice(0, 120);
}
function arrowDelta(key: string): { x: number; y: number } | null {
    if (key === "ArrowLeft") return { x: -1, y: 0 };
    if (key === "ArrowRight") return { x: 1, y: 0 };
    if (key === "ArrowUp") return { x: 0, y: -1 };
    if (key === "ArrowDown") return { x: 0, y: 1 };
    return null;
}
