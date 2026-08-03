import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Key } from "@material-bluemap/shared";
import { ResourcePool, type Loader } from "./ResourcePool.js";

const FOO = Key.parse("minecraft:foo");
const BAR = Key.parse("minecraft:bar");

/** a second Key instance with the same formatted value — upstream compares by Key#equals */
const FOO_AGAIN = new Key("minecraft", "foo");

let debugSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    debugSpy.mockRestore();
});

function debugMessages(): string[] {
    return debugSpy.mock.calls.map((call) => String(call[0]));
}

function loaderOf(value: string | null, calls?: Key[]): Loader<string> {
    return {
        load(path: Key): string | null {
            calls?.push(path);
            return value;
        },
    };
}

describe("ResourcePool map surface", () => {
    it("puts and gets by key value, not key identity", () => {
        const pool = new ResourcePool<string>();
        pool.put(FOO, "a");

        expect(pool.get(FOO)).toBe("a");
        expect(pool.get(FOO_AGAIN)).toBe("a");
        expect(pool.containsKey(FOO_AGAIN)).toBe(true);
        expect(pool.get(BAR)).toBeNull();
        expect(pool.containsKey(BAR)).toBe(false);
    });

    it("overwrites on put and does not overwrite on putIfAbsent", () => {
        const pool = new ResourcePool<string>();
        pool.put(FOO, "a");
        pool.put(FOO_AGAIN, "b");
        expect(pool.get(FOO)).toBe("b");

        pool.putIfAbsent(FOO, "c");
        expect(pool.get(FOO)).toBe("b");

        pool.putIfAbsent(BAR, "c");
        expect(pool.get(BAR)).toBe("c");
    });

    it("rejects a null key (upstream: Objects.requireNonNull)", () => {
        const pool = new ResourcePool<string>();
        expect(() => pool.put(null as unknown as Key, "a")).toThrow("key can not be null");
        expect(() => pool.putIfAbsent(null as unknown as Key, "a")).toThrow("key can not be null");
    });

    it("removes an entry", () => {
        const pool = new ResourcePool<string>();
        pool.put(FOO, "a");
        pool.remove(FOO_AGAIN);
        expect(pool.containsKey(FOO)).toBe(false);
        pool.remove(FOO); // removing a missing key is a no-op
    });

    it("exposes values, keySet and entrySet", () => {
        const pool = new ResourcePool<string>();
        pool.put(FOO, "a");
        pool.put(BAR, "b");

        expect(pool.values()).toEqual(["a", "b"]);
        expect(pool.keySet().map((key) => key.getFormatted())).toEqual([
            "minecraft:foo",
            "minecraft:bar",
        ]);
        expect(pool.entrySet().map(([key, value]) => key.getFormatted() + "=" + value)).toEqual([
            "minecraft:foo=a",
            "minecraft:bar=b",
        ]);
    });
});

describe("ResourcePool#load (first-writer-wins)", () => {
    it("stores the loaded resource", async () => {
        const pool = new ResourcePool<string>();
        await pool.load(FOO, loaderOf("a"));
        expect(pool.get(FOO)).toBe("a");
    });

    it("keeps the first value and never calls the second loader", async () => {
        const pool = new ResourcePool<string>();
        const calls: Key[] = [];

        await pool.load(FOO, loaderOf("first", calls));
        await pool.load(FOO_AGAIN, loaderOf("second", calls));

        expect(pool.get(FOO)).toBe("first");
        expect(calls.length).toBe(1);
    });

    it("does not store a missing (null) resource", async () => {
        const pool = new ResourcePool<string>();
        await pool.load(FOO, loaderOf(null));
        expect(pool.containsKey(FOO)).toBe(false);
    });

    it("swallows a failing loader into a debug-log", async () => {
        const pool = new ResourcePool<string>();
        await pool.load(FOO, {
            load() {
                throw new Error("boom");
            },
        });

        expect(pool.containsKey(FOO)).toBe(false);
        expect(debugMessages()).toEqual(["Failed to load resource 'minecraft:foo': Error: boom"]);
    });

    it("awaits an asynchronous loader", async () => {
        const pool = new ResourcePool<string>();
        await pool.load(FOO, { load: async () => "async" });
        expect(pool.get(FOO)).toBe("async");
    });

    it("swallows a rejecting asynchronous loader", async () => {
        const pool = new ResourcePool<string>();
        await pool.load(FOO, { load: () => Promise.reject(new Error("nope")) });
        expect(pool.containsKey(FOO)).toBe(false);
        expect(debugMessages()[0]).toContain("Failed to load resource");
    });
});

describe("ResourcePool#load (merge)", () => {
    const concat = (previous: string, resource: string): string => previous + "+" + resource;

    it("stores the resource when nothing is present yet", async () => {
        const pool = new ResourcePool<string>();
        await pool.load(FOO, loaderOf("a"), concat);
        expect(pool.get(FOO)).toBe("a");
    });

    it("calls the loader even when the key is present and merges previous with new", async () => {
        const pool = new ResourcePool<string>();
        const calls: Key[] = [];

        await pool.load(FOO, loaderOf("first", calls), concat);
        await pool.load(FOO_AGAIN, loaderOf("second", calls), concat);
        await pool.load(FOO, loaderOf("third", calls), concat);

        expect(pool.get(FOO)).toBe("first+second+third");
        expect(calls.length).toBe(3);
    });

    it("does not merge or store a missing (null) resource", async () => {
        const pool = new ResourcePool<string>();
        pool.put(FOO, "a");
        await pool.load(FOO, loaderOf(null), concat);
        expect(pool.get(FOO)).toBe("a");
    });

    it("swallows a failing loader into a debug-log and keeps the previous value", async () => {
        const pool = new ResourcePool<string>();
        pool.put(FOO, "a");
        await pool.load(
            FOO,
            {
                load() {
                    throw new Error("boom");
                },
            },
            concat,
        );

        expect(pool.get(FOO)).toBe("a");
        expect(debugMessages()).toEqual(["Failed to parse resource 'minecraft:foo': Error: boom"]);
    });

    it("swallows a failing merge-function", async () => {
        const pool = new ResourcePool<string>();
        pool.put(FOO, "a");
        await pool.load(FOO, loaderOf("b"), () => {
            throw new Error("merge failed");
        });

        expect(pool.get(FOO)).toBe("a");
        expect(debugMessages()[0]).toContain("Failed to parse resource");
    });
});
