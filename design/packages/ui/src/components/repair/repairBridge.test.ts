import { afterEach, describe, expect, it } from "vitest";
import { resolveRepairBridge } from "./repairBridge.js";

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

function stub(overrides: Record<string, unknown> = {}) {
    return {
        agentAvailability: async () => ({ available: false, command: "opencode", version: null, message: "" }),
        failures: async () => [],
        diagnose: async () => ({ ok: true, diagnoses: [] }),
        run: async () => ({ ok: true, result: {} }),
        ...overrides,
    };
}

describe("resolving the repair bridge", () => {
    it("is null when there is no shell at all", () => {
        expect(resolveRepairBridge()).toBeNull();
    });

    it("is null when the shell has no repair namespace", () => {
        (globalThis as { worldlens?: unknown }).worldlens = {};
        expect(resolveRepairBridge()).toBeNull();
    });

    it("is null when the namespace is missing even one of the four methods", () => {
        const partial: Record<string, unknown> = stub();
        delete partial["run"];
        (globalThis as { worldlens?: unknown }).worldlens = { repair: partial };
        expect(resolveRepairBridge()).toBeNull();
    });

    it("resolves every method when all four are present", async () => {
        (globalThis as { worldlens?: unknown }).worldlens = { repair: stub() };
        const bridge = resolveRepairBridge();
        expect(bridge).not.toBeNull();
        await expect(bridge?.failures()).resolves.toEqual([]);
    });
});
