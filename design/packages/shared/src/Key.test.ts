import { describe, expect, it } from "vitest";
import { Key } from "./Key.js";

describe("Key", () => {
    it("defaults to the minecraft namespace", () => {
        const key = new Key("stone");
        expect(key.getNamespace()).toBe("minecraft");
        expect(key.getValue()).toBe("stone");
        expect(key.getFormatted()).toBe("minecraft:stone");
    });

    it("parses an explicit namespace", () => {
        const key = new Key("bluemap:something/path");
        expect(key.getNamespace()).toBe("bluemap");
        expect(key.getValue()).toBe("something/path");
        expect(key.getFormatted()).toBe("bluemap:something/path");
    });

    it("keeps a leading ':' as part of the value (upstream Key.java:42 requires separator > 0)", () => {
        const key = new Key(":weird");
        expect(key.getNamespace()).toBe("minecraft");
        expect(key.getValue()).toBe(":weird");
        expect(key.getFormatted()).toBe("minecraft::weird");
    });

    it("splits only on the first ':'", () => {
        const key = new Key("a:b:c");
        expect(key.getNamespace()).toBe("a");
        expect(key.getValue()).toBe("b:c");
    });

    it("constructs from namespace and value", () => {
        const key = new Key("ns", "val");
        expect(key.getFormatted()).toBe("ns:val");
    });

    it("parse uses the given default namespace only when none is present", () => {
        expect(Key.parse("foo", "bluemap").getFormatted()).toBe("bluemap:foo");
        expect(Key.parse("other:foo", "bluemap").getFormatted()).toBe("other:foo");
        expect(Key.parse("foo").getFormatted()).toBe("minecraft:foo");
    });

    it("minecraft() and bluemap() factories", () => {
        expect(Key.minecraft("stone").getFormatted()).toBe("minecraft:stone");
        expect(Key.bluemap("map").getFormatted()).toBe("bluemap:map");
    });

    it("equals compares by formatted value", () => {
        const a = new Key("minecraft:stone");
        const b = new Key("stone");
        const c = new Key("bluemap:stone");
        expect(a.equals(a)).toBe(true);
        expect(a.equals(b)).toBe(true);
        expect(a.equals(c)).toBe(false);
        expect(a.equals("minecraft:stone")).toBe(false);
        expect(a.equals(null)).toBe(false);
    });

    it("hashCode matches Java String#hashCode of the formatted key", () => {
        // "a:b" -> ((97 * 31) + 58) * 31 + 98 = 95113
        expect(new Key("a", "b").hashCode()).toBe(95113);
        // "" is impossible (always contains ':'), ":" alone: "minecraft::" etc. covered above
        expect(new Key("minecraft:stone").hashCode()).toBe(new Key("stone").hashCode());
    });

    it("getKey returns itself and toString the formatted value", () => {
        const key = new Key("stone");
        expect(key.getKey()).toBe(key);
        expect(key.toString()).toBe("minecraft:stone");
    });
});
