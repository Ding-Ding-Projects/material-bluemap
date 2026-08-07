import { afterEach, describe, expect, it } from "vitest";
import { resolveBedrockBridge } from "./bedrockBridge.js";

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

function stub(overrides: Record<string, unknown> = {}) {
    return {
        detect: async () => ({ ok: true }),
        chunkerStatus: async () => ({ ok: true }),
        fetchChunker: async () => ({ ok: true }),
        convert: async () => ({ ok: true }),
        cancel: async () => true,
        onBedrockEvent: () => () => undefined,
        ...overrides,
    };
}

describe("resolving the Bedrock bridge", () => {
    it("is null when there is no shell at all", () => {
        expect(resolveBedrockBridge()).toBeNull();
    });

    it("is null when the shell has no bedrock namespace", () => {
        (globalThis as { worldlens?: unknown }).worldlens = {};
        expect(resolveBedrockBridge()).toBeNull();
    });

    it("is null when the namespace is missing even one of the six methods", () => {
        // A shell from before `bedrock:cancel` existed, say - present is worse than absent
        // here, because a note offering Cancel on a bridge with none would throw on click.
        const partial: Record<string, unknown> = stub();
        delete partial["cancel"];
        (globalThis as { worldlens?: unknown }).worldlens = { bedrock: partial };
        expect(resolveBedrockBridge()).toBeNull();
    });

    it("resolves every method when all six are present", async () => {
        (globalThis as { worldlens?: unknown }).worldlens = { bedrock: stub() };
        const bridge = resolveBedrockBridge();
        expect(bridge).not.toBeNull();
        await expect(bridge?.detect("/srv/world")).resolves.toEqual({ ok: true });
        await expect(bridge?.cancel("id")).resolves.toBe(true);
    });
});
