import { describe, expect, it } from "vitest";
import { NBTReader } from "../NBTReader.js";
import { NBTWriter } from "../NBTWriter.js";
import { RegistryAdapter } from "./RegistryAdapter.js";
import { TagType } from "../TagType.js";
import { bytes, utf } from "../../test/bytes.js";

class FakeKey {
    constructor(readonly formatted: string) {}
    getFormatted(): string {
        return this.formatted;
    }
}

class FakeEntry {
    constructor(readonly key: FakeKey) {}
    getKey(): FakeKey {
        return this.key;
    }
}

function parseKey(formatted: string, defaultNamespace: string): FakeKey {
    return new FakeKey(formatted.includes(":") ? formatted : defaultNamespace + ":" + formatted);
}

function stringReader(value: string): NBTReader {
    const writer = new NBTWriter();
    writer.valueString(value);
    return new NBTReader(writer.toUint8Array());
}

describe("RegistryAdapter", () => {
    const chest = new FakeEntry(new FakeKey("minecraft:chest"));
    const fallback = new FakeEntry(new FakeKey("minecraft:air"));
    const registry = {
        entries: new Map([["minecraft:chest", chest]]),
        get(key: FakeKey): FakeEntry | null {
            return this.entries.get(key.getFormatted()) ?? null;
        },
    };

    it("resolves registry entries by key, defaulting the namespace", () => {
        const adapter = new RegistryAdapter(registry, parseKey, "minecraft", fallback);
        expect(adapter.read(stringReader("minecraft:chest"))).toBe(chest);
        expect(adapter.read(stringReader("chest"))).toBe(chest);
    });

    it("falls back and warns only once per unknown key", () => {
        const warnings: string[] = [];
        const adapter = new RegistryAdapter(registry, parseKey, "minecraft", fallback, (message) =>
            warnings.push(message),
        );

        expect(adapter.read(stringReader("minecraft:unknown"))).toBe(fallback);
        expect(adapter.read(stringReader("minecraft:unknown"))).toBe(fallback);
        expect(adapter.read(stringReader("minecraft:other"))).toBe(fallback);

        expect(warnings).toEqual([
            "Failed to find registry-entry for key: minecraft:unknown",
            "Failed to find registry-entry for key: minecraft:other",
        ]);
    });

    it("writes the formatted key as a string tag", () => {
        const adapter = new RegistryAdapter(registry, parseKey, "minecraft", fallback);
        expect(adapter.type!()).toBe(TagType.STRING);

        const writer = new NBTWriter();
        adapter.write(chest, writer);
        expect([...writer.toUint8Array()]).toEqual([
            ...bytes(TagType.STRING, utf(""), utf("minecraft:chest")),
        ]);
    });
});
