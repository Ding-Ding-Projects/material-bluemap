// @vitest-environment jsdom

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { createWalkthroughGallery } from "./Gallery.js";
import { ACTION_WALKTHROUGHS } from "./manifest.js";

const here = dirname(fileURLToPath(import.meta.url));
const assets = resolve(here, "../assets/walkthroughs");
const gallerySource = readFileSync(resolve(here, "Gallery.ts"), "utf8");
const cssSource = readFileSync(resolve(here, "walkthroughs.css"), "utf8");
const generatorSource = readFileSync(
    resolve(here, "../../scripts/build-walkthrough-gifs.mjs"),
    "utf8",
);

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length(): number {
        return this.values.size;
    }
    clear(): void {
        this.values.clear();
    }
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

describe("action walkthrough inventory", () => {
    it("covers twelve distinct actions with unique media and destinations", () => {
        expect(ACTION_WALKTHROUGHS).toHaveLength(12);
        for (const field of ["id", "gifFile", "stillFile"] as const) {
            expect(new Set(ACTION_WALKTHROUGHS.map((item) => item[field])).size).toBe(12);
        }
        for (const item of ACTION_WALKTHROUGHS) {
            expect(item.articleId.length).toBeGreaterThan(3);
            expect(item.alt.en.length).toBeGreaterThan(40);
            expect(item.alt.yue.length).toBeGreaterThan(14);
            expect(item.description.en).not.toBe(item.alt.en);
        }
    });

    it("ships decodable, bounded GIF and PNG pairs with exact reserved dimensions", () => {
        let totalGifBytes = 0;
        for (const item of ACTION_WALKTHROUGHS) {
            const gifPath = resolve(assets, item.gifFile);
            const pngPath = resolve(assets, item.stillFile);
            expect(existsSync(gifPath), `${item.id} GIF missing`).toBe(true);
            expect(existsSync(pngPath), `${item.id} still missing`).toBe(true);
            const gif = readFileSync(gifPath);
            const png = readFileSync(pngPath);
            expect(gif.subarray(0, 6).toString("ascii")).toMatch(/^GIF8[79]a$/);
            expect(gif.readUInt16LE(6)).toBe(item.width);
            expect(gif.readUInt16LE(8)).toBe(item.height);
            expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
            expect(png.readUInt32BE(16)).toBe(item.width);
            expect(png.readUInt32BE(20)).toBe(item.height);
            const size = statSync(gifPath).size;
            expect(size, `${item.id} exceeds the 900 KiB animation budget`).toBeLessThan(
                900 * 1024,
            );
            totalGifBytes += size;
        }
        expect(totalGifBytes).toBeLessThan(8 * 1024 * 1024);
    });

    it("renders lazy, silent finite media with static reduced-motion sources", () => {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: vi.fn().mockReturnValue({ matches: false }),
        });
        const i18n = new I18n(new Preferences(new MemoryStorage()));
        const gallery = createWalkthroughGallery({ i18n, openArticle: vi.fn() });
        expect(gallery.querySelectorAll("article")).toHaveLength(12);
        for (const image of gallery.querySelectorAll<HTMLImageElement>("img")) {
            expect(image.loading).toBe("lazy");
            expect(image.decoding).toBe("async");
            expect(image.width).toBe(640);
            expect(image.height).toBe(400);
            const source = image.parentElement?.querySelector("source");
            expect(source?.media).toBe("(prefers-reduced-motion: reduce)");
            expect(source?.type).toBe("image/png");
        }
        expect(generatorSource).toContain("repeat: -1");
        expect(gallerySource).not.toMatch(/audio|autoplay/i);
    });

    it("keeps the grid narrow-safe and never clips captions", () => {
        expect(cssSource).toContain("minmax(min(100%, 21rem), 1fr)");
        expect(cssSource).toContain("overflow-wrap: anywhere");
        expect(cssSource).toContain("@container walkthrough-gallery (width < 30rem)");
        const captionRule = /\.mb-walkthrough-caption\s*{[\s\S]*?\n}/.exec(cssSource)?.[0] ?? "";
        expect(captionRule).not.toContain("overflow: hidden");
        expect(cssSource).toContain("@media (prefers-reduced-motion: reduce)");
    });
});
