/**
 * Where the tour's card lands next to the control it is talking about.
 *
 * Pure arithmetic over rectangles, on purpose: `TutorialOverlay.vue` is the only thing that
 * ever measures a real element, and everything it measures is handed here as plain numbers.
 * That is what makes the placement rule itself testable without mounting anything or faking a
 * layout engine - jsdom has none, and every other component in this package that needs a
 * layout decision (`tabModel.ts`, `closePlans.ts`) draws the same line for the same reason.
 *
 * The rule is deliberately simple rather than a full collision-avoiding tooltip engine:
 * below the anchor by default, flipped above it when there is not enough room below but
 * there is above, and clamped inside the viewport either way so the card can never be
 * dragged off-screen by an anchor near an edge. A left-hand corner case (an anchor pinned to
 * the far right of a narrow window) is handled by the same horizontal clamp that keeps the
 * card on screen at all, not by a fourth placement mode.
 */

export interface TutorialRect {
    readonly top: number;
    readonly left: number;
    readonly width: number;
    readonly height: number;
}

export interface TutorialSize {
    readonly width: number;
    readonly height: number;
}

export interface TutorialPoint {
    readonly top: number;
    readonly left: number;
}

/** Space kept between the card and both the anchor and the viewport's own edge. */
export const TUTORIAL_CARD_MARGIN = 12;

/**
 * The card's fixed-position `{ top, left }`, clamped to stay entirely inside the viewport.
 *
 * `card` and `viewport` never legitimately reach zero in a real browser, but a step whose
 * anchor briefly fails to resolve - or a test that has not stubbed a layout engine - can hand
 * this a zeroed rect. `Math.max(1, ...)` on both denominators-of-sorts below is what keeps the
 * clamp from producing `NaN` or a negative-width nonsense position in that case; the card
 * simply settles at the viewport's own top-left margin instead.
 */
export function placeTutorialCard(
    anchor: TutorialRect,
    card: TutorialSize,
    viewport: TutorialSize,
): TutorialPoint {
    const margin = TUTORIAL_CARD_MARGIN;
    const spaceBelow = viewport.height - (anchor.top + anchor.height);
    const spaceAbove = anchor.top;
    const fitsBelow = spaceBelow >= card.height + margin;
    const placeAbove = !fitsBelow && spaceAbove >= card.height + margin;

    const rawTop = placeAbove
        ? anchor.top - card.height - margin
        : anchor.top + anchor.height + margin;

    const maxTop = Math.max(margin, viewport.height - card.height - margin);
    const maxLeft = Math.max(margin, viewport.width - card.width - margin);

    return {
        top: Math.min(Math.max(rawTop, margin), maxTop),
        left: Math.min(Math.max(anchor.left, margin), maxLeft),
    };
}

/** The highlight ring's own fixed-position box: the anchor's rect, padded a little. */
export function placeTutorialHighlight(anchor: TutorialRect): TutorialRect {
    const pad = 6;
    return {
        top: anchor.top - pad,
        left: anchor.left - pad,
        width: anchor.width + pad * 2,
        height: anchor.height + pad * 2,
    };
}
