/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { MaterialShell } from "./materialShell";

describe("MaterialShell", () => {
    beforeEach(() => {
        document.body.innerHTML = "<main id='map'></main>";
        const values = new Map<string, string>();
        Object.defineProperty(window, "localStorage", {
            configurable: true,
            value: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                clear: () => values.clear(),
            },
        });
    });

    it("renders an M3 app bar and persisted appearance controls", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        expect(shell.root.classList.contains("bm-m3-shell")).toBe(true);
        expect(shell.root.querySelector('[aria-label="Open settings"]')).toBeTruthy();
        const theme = shell.root.querySelector("select") as HTMLSelectElement;
        theme.value = "dark";
        theme.dispatchEvent(new Event("change"));
        expect(shell.root.dataset.theme).toBe("dark");
        expect(localStorage.getItem("bluemap-theme")).toBe("dark");
    });

    it("offers a pinpoint action from the anchored context menu", () => {
        const shell = new MaterialShell(document.querySelector("main")!);
        shell.openContextMenu({ hit: { point: { x: 10, y: 64, z: -20 } } } as never, 120, 180);
        const menu = shell.root.querySelector(".bm-m3-menu") as HTMLDivElement;
        expect(menu.hidden).toBe(false);
        (menu.querySelector('[data-action="pin"]') as HTMLButtonElement).click();
        expect(localStorage.getItem("bluemap-pinpoints")).toContain("Pinpoint 1");
        expect(shell.root.querySelector(".bm-m3-pin")?.textContent).toContain("10, 64, -20");
    });
});
