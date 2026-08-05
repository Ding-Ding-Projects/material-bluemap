import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePathFieldBridge } from "./pathFieldHost.js";

function setWindow(value: unknown): void {
    (globalThis as { window?: unknown }).window = value;
}

afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
});

describe("probing the dialog bridge", () => {
    it("reports no bridge when there is no window at all, which is the test environment", () => {
        expect(resolvePathFieldBridge()).toBeNull();
    });

    it("reports no bridge when the shell exposes nothing", () => {
        setWindow({});
        expect(resolvePathFieldBridge()).toBeNull();
    });

    it("reports no bridge when the shell has a bridge but no dialog namespace", () => {
        setWindow({ materialBluemap: { getVersion: () => Promise.resolve("5.22") } });
        expect(resolvePathFieldBridge()).toBeNull();
    });

    it("refuses a half-wired bridge rather than offering a picker that would throw", () => {
        setWindow({ materialBluemap: { dialog: { pickFolder: () => Promise.resolve(null) } } });
        expect(resolvePathFieldBridge()).toBeNull();
    });

    it("accepts a bridge that has both methods, and forwards to it", async () => {
        const pickFolder = vi.fn(() => Promise.resolve("/picked"));
        const pickFile = vi.fn(() => Promise.resolve("/picked/id_ed25519"));
        setWindow({ materialBluemap: { dialog: { pickFolder, pickFile } } });

        const bridge = resolvePathFieldBridge();
        expect(bridge).not.toBeNull();

        expect(await bridge?.pickFolder({ title: "Choose a folder" })).toBe("/picked");
        expect(await bridge?.pickFile({ title: "Choose a file" })).toBe("/picked/id_ed25519");
        expect(pickFolder).toHaveBeenCalledWith({ title: "Choose a folder" });
        expect(pickFile).toHaveBeenCalledWith({ title: "Choose a file" });
    });
});
