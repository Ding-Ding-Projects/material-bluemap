// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { WORLDLENS_IDENTITY } from "@worldlens/shared";
import {
    productDisplayName,
    resetProductDisplayName,
    setProductDisplayName,
    type DisplayNameStorage,
} from "./productName.js";

class MemoryStorage implements DisplayNameStorage {
    readonly values = new Map<string, string>();
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
}

describe("product display name", () => {
    const storage = new MemoryStorage();

    beforeEach(() => {
        storage.values.clear();
        resetProductDisplayName(storage);
    });

    it("updates only presentation and the document title", () => {
        expect(setProductDisplayName("Steve's Map Thing", storage)).toBe("Steve's Map Thing");
        expect(productDisplayName.value).toBe("Steve's Map Thing");
        expect(document.title).toBe("Steve's Map Thing");

        expect(WORLDLENS_IDENTITY.dataDirectoryName).toBe("Worldlens");
        expect(WORLDLENS_IDENTITY.repository).toBe("Ding-Ding-Projects/worldlens");
        expect(WORLDLENS_IDENTITY.markerTool).toBe("worldlens");
        expect(WORLDLENS_IDENTITY.diagnosticsProductName).toBe("Worldlens");
    });

    it("resets blank and explicit reset values to the shipped name", () => {
        setProductDisplayName("   ", storage);
        expect(productDisplayName.value).toBe("Worldlens");
        resetProductDisplayName(storage);
        expect(productDisplayName.value).toBe("Worldlens");
        expect(document.title).toBe("Worldlens");
    });
});

