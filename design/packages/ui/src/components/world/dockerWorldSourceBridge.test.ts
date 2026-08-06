import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDockerWorldSourceBridge } from "./dockerWorldSourceBridge.js";

afterEach(() => vi.unstubAllGlobals());

function complete() {
    return {
        list: vi.fn(),
        inspectContainer: vi.fn(),
        inspectVolume: vi.fn(),
        fetch: vi.fn(),
        cancel: vi.fn(),
        active: vi.fn(),
        fingerprint: vi.fn(),
        fingerprintsEqual: vi.fn(),
        onDockerWorldEvent: vi.fn(),
    };
}

describe("resolveDockerWorldSourceBridge", () => {
    it("resolves the real nested preload namespace only when every safety/progress method exists", () => {
        const dockerWorld = complete();
        vi.stubGlobal("materialBluemap", { dockerWorld });
        expect(resolveDockerWorldSourceBridge()).toBe(dockerWorld);
    });

    it("refuses a partial bridge with no event listener instead of presenting invented progress", () => {
        const partial = { ...complete(), onDockerWorldEvent: undefined };
        vi.stubGlobal("materialBluemap", { dockerWorld: partial });
        expect(resolveDockerWorldSourceBridge()).toBeNull();
    });
});
