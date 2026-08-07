import { afterEach, describe, expect, it, vi } from "vitest";
import {
    resolveSshWorldSourceBridge,
    surveyLooksLikeWorld,
    type SshWorldSourceBridge,
} from "./sshWorldSourceBridge.js";

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

function realShape(): SshWorldSourceBridge {
    return {
        validate: vi.fn(),
        detect: vi.fn(),
        trustHostKey: vi.fn(),
        checkPath: vi.fn(),
        survey: vi.fn(),
        diff: vi.fn(),
        fetch: vi.fn(),
        cancel: vi.fn(),
        active: vi.fn(),
        onSshWorldSourceEvent: vi.fn(),
    } as unknown as SshWorldSourceBridge;
}

describe("the real window.worldlens.sshWorldSource seam", () => {
    it("resolves the complete nested namespace the preload actually exposes", () => {
        const bridge = realShape();
        (globalThis as { worldlens?: unknown }).worldlens = { sshWorldSource: bridge };
        expect(resolveSshWorldSourceBridge()).toBe(bridge);
    });

    it("refuses a partial namespace instead of rendering controls that throw", () => {
        (globalThis as { worldlens?: unknown }).worldlens = {
            sshWorldSource: { validate: vi.fn(), detect: vi.fn() },
        };
        expect(resolveSshWorldSourceBridge()).toBeNull();
    });
});

describe("survey world likelihood", () => {
    it("requires both level.dat and a real region file", () => {
        expect(
            surveyLooksLikeWorld([
                { path: "level.dat", size: 12, mtimeMs: 1 },
                { path: "region/r.0.0.mca", size: 4096, mtimeMs: 2 },
            ]),
        ).toBe(true);
        expect(surveyLooksLikeWorld([{ path: "level.dat", size: 12, mtimeMs: 1 }])).toBe(false);
        expect(surveyLooksLikeWorld([{ path: "region/readme.txt", size: 12, mtimeMs: 1 }])).toBe(
            false,
        );
    });
});
