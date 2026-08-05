// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { confirmDestructive, installDestructiveGate } from "./confirm.js";

/**
 * The default destructive gate: two independent key challenges before the slider even
 * unlocks, and only a slider that reaches 100 resolves the promise true. Everything else -
 * the emergency exit, Escape, a native dialog dismissal - has to resolve false, because
 * treating a dismissal as consent is exactly the mistake a destructive gate must never make.
 */
describe("confirmDestructive (default gate)", () => {
    afterEach(() => {
        installDestructiveGate(null);
        for (const dialog of document.querySelectorAll("dialog")) dialog.remove();
    });

    function dialogParts() {
        const dialog = document.querySelector("dialog.mb-confirm--super");
        expect(dialog).not.toBeNull();
        const [first, second] = [
            ...dialog!.querySelectorAll<HTMLInputElement>("input.mb-confirm-key"),
        ] as [HTMLInputElement, HTMLInputElement];
        const slider = dialog!.querySelector<HTMLInputElement>("input.mb-confirm-slider")!;
        const cancel = [...dialog!.querySelectorAll<HTMLButtonElement>("button")].find(
            (button) => button.className.includes("outlined"),
        )!;
        const proceed = [...dialog!.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
            button.className.includes("danger"),
        )!;
        return { dialog: dialog as HTMLDialogElement, first, second, slider, cancel, proceed };
    }

    it("keeps the slider disabled until both key challenges are answered correctly", () => {
        void confirmDestructive("Delete everything");
        const { first, second, slider } = dialogParts();
        expect(slider.disabled).toBe(true);

        first.value = "reset";
        first.dispatchEvent(new Event("input"));
        expect(slider.disabled).toBe(true);

        second.value = "wrong";
        second.dispatchEvent(new Event("input"));
        expect(slider.disabled).toBe(true);

        second.value = "all";
        second.dispatchEvent(new Event("input"));
        expect(slider.disabled).toBe(false);
    });

    it("resolves true only once the slider reaches the full range after both keys unlock it", async () => {
        const result = confirmDestructive("Delete everything");
        const { first, second, slider } = dialogParts();
        first.value = "RESET";
        first.dispatchEvent(new Event("input"));
        second.value = "ALL";
        second.dispatchEvent(new Event("input"));

        slider.value = "50";
        slider.dispatchEvent(new Event("input"));
        // Not yet at the top of the range: still unresolved.
        let settled = false;
        void result.then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);

        slider.value = "100";
        slider.dispatchEvent(new Event("input"));
        await expect(result).resolves.toBe(true);
    });

    it("locks the slider back to zero if a key is edited after it unlocked", () => {
        void confirmDestructive("Delete everything");
        const { first, second, slider } = dialogParts();
        first.value = "RESET";
        first.dispatchEvent(new Event("input"));
        second.value = "ALL";
        second.dispatchEvent(new Event("input"));
        expect(slider.disabled).toBe(false);

        second.value = "AL";
        second.dispatchEvent(new Event("input"));
        expect(slider.disabled).toBe(true);
        expect(slider.value).toBe("0");
    });

    it("resolves false when the emergency exit is used, even mid-slide", async () => {
        const result = confirmDestructive("Delete everything");
        const { first, second, slider, cancel } = dialogParts();
        first.value = "RESET";
        first.dispatchEvent(new Event("input"));
        second.value = "ALL";
        second.dispatchEvent(new Event("input"));
        slider.value = "80";
        slider.dispatchEvent(new Event("input"));

        cancel.click();
        await expect(result).resolves.toBe(false);
    });

    it("resolves false when the dialog is dismissed via the platform cancel path", async () => {
        const result = confirmDestructive("Delete everything");
        const { dialog } = dialogParts();
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
        await expect(result).resolves.toBe(false);
    });

    it("does not resolve true from a click on Proceed while the slider is still short of 100", async () => {
        const result = confirmDestructive("Delete everything");
        const { first, second, slider, proceed } = dialogParts();
        first.value = "RESET";
        first.dispatchEvent(new Event("input"));
        second.value = "ALL";
        second.dispatchEvent(new Event("input"));
        slider.value = "90";
        slider.dispatchEvent(new Event("input"));

        proceed.click();
        let settled = false;
        void result.then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
    });

    it("lets a caller install a stronger gate that replaces the default entirely", async () => {
        installDestructiveGate(async (message) => message === "allow me");
        await expect(confirmDestructive("allow me")).resolves.toBe(true);
        await expect(confirmDestructive("refuse me")).resolves.toBe(false);
    });
});
