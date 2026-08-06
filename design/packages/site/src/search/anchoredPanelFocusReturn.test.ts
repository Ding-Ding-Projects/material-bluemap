// @vitest-environment jsdom

/**
 * Regression guard: `AnchoredPanel.close()` must not call `.focus()` on `returnFocusTo` once it
 * has left the document.
 *
 * `close()` used to call `this.options.returnFocusTo.focus()` unconditionally. If the element
 * the panel was opened for -- a context-menu trigger, an appearance-editor target, a row's own
 * control -- was removed from the DOM before the panel closed (the page re-rendered, or the row
 * was closed by some other action while the menu/editor/picker was still open), that call landed
 * on a disconnected node.
 *
 * `Element.focus()` on a disconnected node is a defined no-op (the HTML spec's focusing steps
 * abort immediately because a disconnected element has no focusable area), so it can never
 * itself *move* focus onto -- or away from -- anything: `document.activeElement` is identical
 * whether the call happens or is skipped. That is exactly why this file asserts the call itself
 * (via a spy) rather than the resulting `document.activeElement`: a `document.activeElement`
 * assertion could never distinguish the guarded code from the unguarded code, since by the time
 * this call runs, `this.element.replaceChildren()` a few lines above has already dropped focus
 * to `<body>` (removing the currently-focused panel content blurs it) regardless of whether
 * `returnFocusTo` is connected. What the guard genuinely buys is real: it stops the panel from
 * reaching for a node that is no longer part of the page at all, mirroring the identical
 * `if (this.anchor.isConnected) this.anchor.focus();` guard `Overlay.close()` already carries in
 * `../platform/Overlay.ts` -- the sibling overlay implementation that this one was missing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnchoredPanel } from "./anchoredPanel.js";

let panel: AnchoredPanel | null = null;

beforeEach(() => {
    document.body.replaceChildren();
});

afterEach(() => {
    panel?.destroy();
    panel = null;
    document.body.replaceChildren();
});

function buildAnchorAndReturnTarget(): { anchor: HTMLButtonElement; returnFocusTo: HTMLButtonElement } {
    const anchor = document.createElement("button");
    anchor.textContent = "Open";
    const returnFocusTo = document.createElement("button");
    returnFocusTo.textContent = "Row action";
    document.body.append(anchor, returnFocusTo);
    return { anchor, returnFocusTo };
}

function buildPanelContent(): HTMLElement {
    const content = document.createElement("div");
    const item = document.createElement("button");
    item.textContent = "Menu item";
    content.append(item);
    return content;
}

describe("AnchoredPanel.close(): focus return when returnFocusTo has left the DOM", () => {
    it("never calls .focus() on returnFocusTo once it is disconnected", () => {
        const { anchor, returnFocusTo } = buildAnchorAndReturnTarget();
        panel = new AnchoredPanel({ anchor, returnFocusTo, title: "Test panel" });
        panel.show(buildPanelContent());

        // The row (and its control) gets removed from the document while the panel is still
        // open -- e.g. a page re-render, or the row being closed by some other action.
        returnFocusTo.remove();
        expect(returnFocusTo.isConnected).toBe(false);

        const focusSpy = vi.spyOn(returnFocusTo, "focus");

        expect(() => panel!.close()).not.toThrow();
        expect(focusSpy).not.toHaveBeenCalled();
    });

    it("still calls .focus() on returnFocusTo, and moves focus there, when it is connected", () => {
        const { anchor, returnFocusTo } = buildAnchorAndReturnTarget();
        panel = new AnchoredPanel({ anchor, returnFocusTo, title: "Test panel" });
        panel.show(buildPanelContent());

        const focusSpy = vi.spyOn(returnFocusTo, "focus");

        panel.close();

        expect(focusSpy).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(returnFocusTo);
    });

    it("still fires onClose when returnFocusTo has been removed", () => {
        const { anchor, returnFocusTo } = buildAnchorAndReturnTarget();
        const onClose = vi.fn();
        panel = new AnchoredPanel({ anchor, returnFocusTo, title: "Test panel", onClose });
        panel.show(buildPanelContent());

        returnFocusTo.remove();
        panel.close();

        expect(onClose).toHaveBeenCalledOnce();
    });
});
