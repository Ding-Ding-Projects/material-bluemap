/**
 * The gate itself, proven both ways rather than trusted by inspection.
 *
 * `existsSync` is mocked because the real answer depends on whether this checkout
 * happens to have `vendor/BlueMap` fetched, which is exactly the variable this file
 * needs to control to prove both branches - the module is re-imported fresh under each
 * mock via `vi.resetModules`, since `vendorAvailable` is read once at module load.
 *
 * `requireVendorInCi`'s own registered test is captured rather than merely inferred:
 * this file replaces vitest's own `it` for the duration of the import, records the
 * callback `requireVendorInCi` hands it, and then calls that callback directly - the
 * same body vitest would have run - so what is proven here is the real assertion
 * failing or not, not a second copy of the condition it branches on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env["MBM_VENDOR_REQUIRED"];

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    vi.doUnmock("node:fs");
    vi.doUnmock("vitest");
    if (ORIGINAL_ENV === undefined) delete process.env["MBM_VENDOR_REQUIRED"];
    else process.env["MBM_VENDOR_REQUIRED"] = ORIGINAL_ENV;
});

type TestFn = () => void | Promise<void>;

/** Loads `vendorGate.ts` with `existsSync` mocked, and captures every `it()` it calls. */
async function loadWith(available: boolean): Promise<{
    readonly gate: typeof import("./vendorGate.js");
    readonly registered: { readonly name: string; readonly fn: TestFn }[];
}> {
    const registered: { name: string; fn: TestFn }[] = [];
    vi.doMock("node:fs", () => ({ existsSync: () => available }));
    vi.doMock("vitest", async (importOriginal) => {
        const actual = await importOriginal<typeof import("vitest")>();
        return {
            ...actual,
            it: (name: string, fn: TestFn) => {
                registered.push({ name, fn });
            },
        };
    });
    const gate = await import("./vendorGate.js");
    return { gate, registered };
}

describe("when the submodule is checked out", () => {
    it("reports it available and adds no suffix to a cross-check's name", async () => {
        const { gate } = await loadWith(true);
        expect(gate.vendorAvailable).toBe(true);
        expect(gate.vendorSuffix).toBe("");
    });
});

describe("when the submodule is not checked out", () => {
    it("reports it unavailable and names the reason in the suffix", async () => {
        const { gate } = await loadWith(false);
        expect(gate.vendorAvailable).toBe(false);
        expect(gate.vendorSuffix).toContain("SKIPPED");
        expect(gate.vendorSuffix).toContain("vendor/BlueMap");
        expect(gate.vendorSuffix).toContain("git submodule update --init");
    });
});

describe("requireVendorInCi, the loud half", () => {
    it("passes when CI has not asked for the guarantee, submodule present or not", async () => {
        delete process.env["MBM_VENDOR_REQUIRED"];
        const { gate, registered } = await loadWith(false);
        gate.requireVendorInCi();
        expect(registered).toHaveLength(1);
        expect(() => registered[0]!.fn()).not.toThrow();
    });

    it("fails loudly when CI requires it and the submodule is missing", async () => {
        process.env["MBM_VENDOR_REQUIRED"] = "1";
        const { gate, registered } = await loadWith(false);
        gate.requireVendorInCi();
        expect(registered).toHaveLength(1);
        // `expect().toThrow()` cannot wrap a call that itself returns a promise from a
        // synchronous assertion, and this body is synchronous throughout - only the
        // wrapping in `import()` above is async - so a plain throw check is exact here.
        expect(() => registered[0]!.fn()).toThrow(/MBM_VENDOR_REQUIRED=1/);
    });

    it("passes when CI requires it and the submodule genuinely is there", async () => {
        process.env["MBM_VENDOR_REQUIRED"] = "1";
        const { gate, registered } = await loadWith(true);
        gate.requireVendorInCi();
        expect(registered).toHaveLength(1);
        expect(() => registered[0]!.fn()).not.toThrow();
    });
});
