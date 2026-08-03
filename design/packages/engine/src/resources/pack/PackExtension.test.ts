import { describe, expect, it } from "vitest";
import { PackExtension } from "./PackExtension.js";
import { DirFileSystem } from "./vfs/DirFileSystem.js";
import type { PackPath } from "./vfs/PackFileSystem.js";

const ROOTS: PackPath[] = [new DirFileSystem("/does-not-matter").getRoot()];

describe("PackExtension", () => {
    it("applies the upstream no-op interface-defaults when nothing is implemented", async () => {
        const extension: PackExtension = {};
        await expect(PackExtension.loadResources(extension, ROOTS)).resolves.toBeUndefined();
        await expect(PackExtension.bake(extension)).resolves.toBeUndefined();
    });

    it("invokes an implemented loadResources with the roots", async () => {
        const seen: PackPath[][] = [];
        const extension: PackExtension = {
            async loadResources(roots) {
                seen.push([...roots]);
            },
        };

        await PackExtension.loadResources(extension, ROOTS);
        await PackExtension.bake(extension); // still the no-op default

        expect(seen).toEqual([ROOTS]);
    });

    it("invokes an implemented bake", async () => {
        let baked = 0;
        const extension: PackExtension = {
            async bake() {
                baked++;
            },
        };

        await PackExtension.loadResources(extension, ROOTS); // still the no-op default
        await PackExtension.bake(extension);

        expect(baked).toBe(1);
    });

    it("propagates a failure of an implemented member", async () => {
        const extension: PackExtension = {
            bake: () => Promise.reject(new Error("bake failed")),
        };
        await expect(PackExtension.bake(extension)).rejects.toThrow("bake failed");
    });
});
