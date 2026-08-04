/**
 * Where a docked surface lives, per surface, remembered.
 *
 * The settings surface was a right-hand drawer because somebody had to pick one. On a
 * wide display that is fine; on a tall narrow window it takes half the screen, and for a
 * person whose map is on the right it covers exactly the thing they were looking at. So
 * the placement is a choice: a floating panel, or docked to the left, right, top or
 * bottom edge. Each surface remembers its own, because the answer for a settings sheet
 * and the answer for a document viewer are not the same answer.
 *
 * This module is the whole of the decision-making, as pure functions over plain values,
 * for the usual reason: geometry is where this goes wrong, and it goes wrong in ways no
 * screenshot catches. "Does a bottom dock at 200% scale still leave the button that
 * opened it visible" is a question with one right answer and a test can state it.
 *
 * ## Never covering the control that opened it
 *
 * A surface that covers its own opener is the specific failure this has to avoid: the
 * button is still there, still focusable, still announced, and completely invisible - so
 * a user pressing it again to close the panel is pressing the panel. {@link resolveDockLayout}
 * therefore takes the opener's rectangle and:
 *
 *  - for a docked placement, **shrinks the panel along its docking axis** so its edge stops
 *    short of the opener. A right dock beside a button 520px from the right edge is 520px
 *    wide, not 520px overlapping;
 *  - falls back to **floating** when even {@link MINIMUM_THICKNESS} would not fit, and says
 *    so in the returned layout rather than silently doing something else;
 *  - for a floating panel, picks the corner that does not intersect the opener at all, and
 *    when every corner does, the one that intersects least.
 *
 * There is deliberately no option to overlap anyway. The opener is the control the user
 * pressed a moment ago and expects to press again.
 *
 * ## Where this lives
 *
 * In `components/settings/` because a placement is a setting: the global reset lives on
 * the settings surface, and the surfaces that use it import from here. It is not specific
 * to the settings sheet, and {@link DOCK_PLACEMENTS} carries no knowledge of any
 * particular surface.
 */

/** The placements a surface may take, in the order every chooser lists them. */
export const DOCK_PLACEMENTS = ["floating", "left", "right", "top", "bottom"] as const;

export type DockPlacement = (typeof DOCK_PLACEMENTS)[number];

/** Docked placements only, which are the ones with a thickness and an edge. */
export type DockedEdge = Exclude<DockPlacement, "floating">;

export function isDockPlacement(value: unknown): value is DockPlacement {
    return typeof value === "string" && (DOCK_PLACEMENTS as readonly string[]).includes(value);
}

/** True for a placement that occupies an edge rather than floating over the app. */
export function isDockedEdge(placement: DockPlacement): placement is DockedEdge {
    return placement !== "floating";
}

/** The axis a placement is measured along: horizontal for left/right, vertical for top/bottom. */
export function dockAxis(edge: DockedEdge): "horizontal" | "vertical" {
    return edge === "left" || edge === "right" ? "horizontal" : "vertical";
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = "material-bluemap-dock-placement";

/** Bumped when the stored shape changes in a way an older reader cannot repair. */
export const DOCK_STORAGE_VERSION = 1;

/** The three methods used, so a test passes a plain object and nothing else leaks. */
export interface DockStorage {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
}

function defaultStorage(): DockStorage | null {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        // Reading `localStorage` itself throws where storage is blocked outright.
        return null;
    }
}

/** Every surface's chosen placement, keyed by surface id. */
export type DockPlacementRecord = Readonly<Record<string, DockPlacement>>;

/**
 * The stored placements, or an empty record.
 *
 * Unknown placements are dropped one at a time rather than the whole file being refused:
 * a build that removes a placement should not cost the user their choice for four other
 * surfaces, and the surface whose value was dropped simply falls back to its default.
 */
export function readDockPlacements(storage: DockStorage | null = defaultStorage()): DockPlacementRecord {
    if (storage === null) return {};
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (raw === null) return {};
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
        const record = parsed as Record<string, unknown>;
        if (record["version"] !== DOCK_STORAGE_VERSION) return {};
        const surfaces = record["surfaces"];
        if (typeof surfaces !== "object" || surfaces === null || Array.isArray(surfaces)) return {};

        const found: Record<string, DockPlacement> = {};
        for (const [id, value] of Object.entries(surfaces as Record<string, unknown>)) {
            if (id.length > 0 && isDockPlacement(value)) found[id] = value;
        }
        return found;
    } catch {
        return {};
    }
}

/** Writes the record, silently doing nothing where storage refuses. */
export function writeDockPlacements(
    placements: DockPlacementRecord,
    storage: DockStorage | null = defaultStorage(),
): void {
    if (storage === null) return;
    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: DOCK_STORAGE_VERSION, surfaces: { ...placements } }),
        );
    } catch {
        // Private mode or a full quota. A remembered panel position is not worth a toast.
    }
}

/** The record with one surface set. Pure, so the state module has one place that writes. */
export function withPlacement(
    placements: DockPlacementRecord,
    surfaceId: string,
    placement: DockPlacement,
): DockPlacementRecord {
    return { ...placements, [surfaceId]: placement };
}

/** The record with one surface's choice removed, which is that surface's own reset. */
export function withoutPlacement(placements: DockPlacementRecord, surfaceId: string): DockPlacementRecord {
    const next = { ...placements };
    delete next[surfaceId];
    return next;
}

/**
 * Clears every surface's choice.
 *
 * The global reset removes the key rather than writing an empty object, so a surface
 * added by a later build starts from its own default rather than from a record that
 * happens to be empty for reasons nobody remembers.
 */
export function clearDockPlacements(storage: DockStorage | null = defaultStorage()): void {
    if (storage === null) return;
    try {
        storage.removeItem(STORAGE_KEY);
    } catch {
        // As above.
    }
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

export interface Rect {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

export interface Size {
    readonly width: number;
    readonly height: number;
}

/** Below this, a docked panel is too narrow to hold a search field and a heading. */
export const MINIMUM_THICKNESS = 240;

/** Space kept between a floating panel and the edges of the window. */
export const FLOATING_MARGIN = 16;

export interface DockRequest {
    readonly placement: DockPlacement;
    /** The window, in CSS pixels. */
    readonly viewport: Size;
    /** The control that opened the surface, or null when it is not known. */
    readonly opener: Rect | null;
    /** How thick a docked panel would like to be. */
    readonly preferredThickness: number;
    /** How big a floating panel would like to be. */
    readonly preferredSize: Size;
}

export interface DockLayout {
    /** What the surface actually does, which is not always what was asked for. */
    readonly placement: DockPlacement;
    /** What was asked for, so the chooser can keep showing the user's choice. */
    readonly requested: DockPlacement;
    /** Along the docking axis, in pixels. Zero for a floating panel. */
    readonly thickness: number;
    /** Top-left corner of a floating panel, in pixels. Null when docked. */
    readonly offset: { readonly top: number; readonly left: number } | null;
    /** Size of a floating panel. Null when docked. */
    readonly size: Size | null;
    /** True when the panel was made thinner than it wanted so as to clear the opener. */
    readonly shrunkToClearOpener: boolean;
    /** True when the requested edge could not clear the opener at any usable width. */
    readonly fellBackToFloating: boolean;
}

function clamp(value: number, low: number, high: number): number {
    return Math.max(low, Math.min(high, value));
}

/**
 * The most a panel on `edge` can measure without touching `opener`.
 *
 * Positive infinity when there is no opener, because there is then nothing to clear. A
 * value of zero or less means the opener is against that edge and the panel cannot be
 * there at all.
 */
export function thicknessClearingOpener(edge: DockedEdge, opener: Rect | null, viewport: Size): number {
    if (opener === null) return Number.POSITIVE_INFINITY;
    switch (edge) {
        case "left":
            return opener.left;
        case "right":
            return viewport.width - (opener.left + opener.width);
        case "top":
            return opener.top;
        case "bottom":
            return viewport.height - (opener.top + opener.height);
    }
}

/** Area two rectangles share. Zero when they do not touch. */
export function overlapArea(a: Rect, b: Rect): number {
    const horizontal = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
    const vertical = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
    return horizontal * vertical;
}

/**
 * Where a floating panel of `size` goes so as to clear the opener.
 *
 * The four corners are tried in a fixed order and the first that does not touch the
 * opener wins, so the panel lands in the same place every time for the same window - a
 * panel that appears somewhere different on each opening is one nobody learns the
 * position of. When every corner touches the opener, the least-overlapping corner is
 * used; that happens only in a window too small to hold both, where something has to
 * give and reporting it honestly is all that is left.
 */
export function floatingOffset(
    size: Size,
    viewport: Size,
    opener: Rect | null,
): { readonly top: number; readonly left: number } {
    const maxLeft = Math.max(FLOATING_MARGIN, viewport.width - size.width - FLOATING_MARGIN);
    const maxTop = Math.max(FLOATING_MARGIN, viewport.height - size.height - FLOATING_MARGIN);

    const corners = [
        { top: maxTop, left: maxLeft },
        { top: FLOATING_MARGIN, left: maxLeft },
        { top: maxTop, left: FLOATING_MARGIN },
        { top: FLOATING_MARGIN, left: FLOATING_MARGIN },
    ] as const;

    if (opener === null) return corners[0];

    let best = corners[0];
    let bestOverlap = Number.POSITIVE_INFINITY;
    for (const corner of corners) {
        const area = overlapArea({ ...corner, width: size.width, height: size.height }, opener);
        if (area === 0) return corner;
        if (area < bestOverlap) {
            best = corner;
            bestOverlap = area;
        }
    }
    return best;
}

/**
 * The layout a surface should render, given what the user chose and what will fit.
 *
 * The returned `placement` is what actually happens and `requested` is what the user
 * asked for; the chooser keeps showing `requested` so a temporary window size does not
 * quietly rewrite somebody's preference, and the surface says out loud when the two
 * differ.
 */
export function resolveDockLayout(request: DockRequest): DockLayout {
    const { viewport, opener } = request;

    if (request.placement === "floating") {
        const size = {
            width: clamp(request.preferredSize.width, 0, Math.max(0, viewport.width - FLOATING_MARGIN * 2)),
            height: clamp(request.preferredSize.height, 0, Math.max(0, viewport.height - FLOATING_MARGIN * 2)),
        };
        return {
            placement: "floating",
            requested: "floating",
            thickness: 0,
            offset: floatingOffset(size, viewport, opener),
            size,
            shrunkToClearOpener: false,
            fellBackToFloating: false,
        };
    }

    const edge = request.placement;
    const axisExtent = dockAxis(edge) === "horizontal" ? viewport.width : viewport.height;
    const clearance = thicknessClearingOpener(edge, opener, viewport);
    const wanted = Math.min(request.preferredThickness, axisExtent);
    const allowed = Math.min(wanted, clearance);

    if (allowed < Math.min(MINIMUM_THICKNESS, axisExtent)) {
        // The opener is too close to this edge for a usable panel. Falling back is stated
        // rather than done quietly, because the user picked an edge and is entitled to
        // know why they are looking at something else.
        const size = {
            width: clamp(request.preferredSize.width, 0, Math.max(0, viewport.width - FLOATING_MARGIN * 2)),
            height: clamp(request.preferredSize.height, 0, Math.max(0, viewport.height - FLOATING_MARGIN * 2)),
        };
        return {
            placement: "floating",
            requested: edge,
            thickness: 0,
            offset: floatingOffset(size, viewport, opener),
            size,
            shrunkToClearOpener: false,
            fellBackToFloating: true,
        };
    }

    return {
        placement: edge,
        requested: edge,
        thickness: allowed,
        offset: null,
        size: null,
        shrunkToClearOpener: allowed < wanted,
        fellBackToFloating: false,
    };
}

/**
 * The CSS a layout turns into.
 *
 * Returned as a plain object so the component binds it with `:style` and a test asserts on
 * it without a layout engine. `position: fixed` throughout: a docked surface is chrome
 * over the window, not a participant in the document's flow, and at 200% display scale
 * that is the only way its edge stays the window's edge.
 */
export function dockStyle(layout: DockLayout): Readonly<Record<string, string>> {
    if (layout.placement === "floating") {
        const size = layout.size ?? { width: 0, height: 0 };
        const offset = layout.offset ?? { top: FLOATING_MARGIN, left: FLOATING_MARGIN };
        return {
            position: "fixed",
            top: `${String(Math.round(offset.top))}px`,
            left: `${String(Math.round(offset.left))}px`,
            width: `${String(Math.round(size.width))}px`,
            "max-width": `calc(100vw - ${String(FLOATING_MARGIN * 2)}px)`,
            "max-height": `${String(Math.round(size.height))}px`,
        };
    }

    const thickness = `${String(Math.round(layout.thickness))}px`;
    switch (layout.placement) {
        case "left":
            return { position: "fixed", top: "0", bottom: "0", left: "0", width: thickness, "max-width": "100vw" };
        case "right":
            return { position: "fixed", top: "0", bottom: "0", right: "0", width: thickness, "max-width": "100vw" };
        case "top":
            return { position: "fixed", top: "0", left: "0", right: "0", height: thickness, "max-height": "100dvh" };
        case "bottom":
            return { position: "fixed", bottom: "0", left: "0", right: "0", height: thickness, "max-height": "100dvh" };
    }
}
